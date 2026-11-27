import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requirePortalAccess } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

async function verifyExamOwnership(schoolId: string, examLocalId: number, role: string, localId: number) {
  const sql = getSql();
  const rows = await sql`
    SELECT local_id, name, exam_class, teacher_local_id
    FROM portal_exams
    WHERE school_id = ${schoolId}::uuid AND local_id = ${examLocalId}
    LIMIT 1
  `;
  if (!rows.length) return { ok: false as const, status: 404, message: "Exam not found." };
  const exam = rows[0] as Record<string, any>;
  if (role === "teacher" && exam.teacher_local_id != null && Number(exam.teacher_local_id) !== localId) {
    return { ok: false as const, status: 403, message: "You can only manage questions for your own exams." };
  }
  return { ok: true as const, exam };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ examId: string }> }
) {
  const gate = await requirePortalAccess(req, ["teacher", "admin"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  const { examId } = await context.params;
  const examLocalId = Number(examId);
  if (!Number.isInteger(examLocalId) || examLocalId <= 0) {
    return NextResponse.json({ ok: false, message: "Invalid exam ID." }, { status: 400 });
  }

  const check = await verifyExamOwnership(session.schoolId, examLocalId, session.role, session.localId);
  if (!check.ok) return NextResponse.json({ ok: false, message: check.message }, { status: check.status });

  const sql = getSql();
  const questions = await sql`
    SELECT local_id, section_local_id, group_local_id, question, option1, option2, option3, option4,
           answer, explanation, display_order, mandatory, created_online
    FROM portal_questions
    WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${examLocalId}
    ORDER BY display_order ASC, local_id ASC
  `;
  return NextResponse.json({ ok: true, exam: check.exam, questions });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ examId: string }> }
) {
  const gate = await requirePortalAccess(req, ["teacher", "admin"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  const { examId } = await context.params;
  const examLocalId = Number(examId);
  if (!Number.isInteger(examLocalId) || examLocalId <= 0) {
    return NextResponse.json({ ok: false, message: "Invalid exam ID." }, { status: 400 });
  }

  const check = await verifyExamOwnership(session.schoolId, examLocalId, session.role, session.localId);
  if (!check.ok) return NextResponse.json({ ok: false, message: check.message }, { status: check.status });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });

  // Support both single question creation AND bulk array import (for CSV upload!)
  const rawItems: Record<string, unknown>[] = Array.isArray(body.questions)
    ? (body.questions as Record<string, unknown>[])
    : [body];

  const validItems = rawItems
    .map((item) => {
      const q = String(item.question || "").trim();
      const o1 = String(item.option1 || "").trim();
      const o2 = String(item.option2 || "").trim();
      const o3 = String(item.option3 || "").trim();
      const o4 = String(item.option4 || "").trim();
      let ans = String(item.answer || "").trim();
      // Normalize A/B/C/D shortcut to exact option text so offline & online grading match 100%
      const up = ans.toUpperCase();
      if (up === "A" && o1) ans = o1;
      else if (up === "B" && o2) ans = o2;
      else if (up === "C" && o3) ans = o3;
      else if (up === "D" && o4) ans = o4;
      return {
        question: q,
        option1: o1,
        option2: o2,
        option3: o3,
        option4: o4,
        answer: ans || o1,
        explanation: String(item.explanation || "").trim(),
        section_local_id: item.section_local_id ? Number(item.section_local_id) : null,
        group_local_id: item.group_local_id ? Number(item.group_local_id) : null,
        mandatory: Boolean(item.mandatory),
      };
    })
    .filter((item) => item.question && item.option1 && item.option2);

  if (!validItems.length) {
    return NextResponse.json(
      { ok: false, message: "Enter the question text and at least Option A and Option B." },
      { status: 400 }
    );
  }

  const sql = getSql();
  const maxRows = await sql`
    SELECT GREATEST(500000, COALESCE(MAX(local_id), 500000))::int AS max_id,
           COALESCE(MAX(display_order), 0)::int AS max_order
    FROM portal_questions
    WHERE school_id = ${session.schoolId}::uuid
  `;
  let nextId = Number(maxRows[0]?.max_id || 500000);
  let nextOrder = Number(maxRows[0]?.max_order || 0);

  const prepared = validItems.map((it) => {
    nextId += 1;
    nextOrder += 1;
    return { local_id: nextId, display_order: nextOrder, ...it };
  });

  await sql`
    INSERT INTO portal_questions (
      school_id, local_id, exam_local_id, section_local_id, group_local_id,
      question, option1, option2, option3, option4,
      answer, explanation, display_order, mandatory, created_online, updated_at
    )
    SELECT
      ${session.schoolId}::uuid, x.local_id, ${examLocalId}, x.section_local_id, x.group_local_id,
      x.question, x.option1, x.option2,
      x.option3, x.option4, x.answer, x.explanation, x.display_order, x.mandatory, TRUE, NOW()
    FROM jsonb_to_recordset(${JSON.stringify(prepared)}::jsonb)
      AS x(
        local_id int, section_local_id int, group_local_id int,
        question text, option1 text, option2 text, option3 text, option4 text,
        answer text, explanation text, display_order int, mandatory boolean
      )
  `;

  // Mark exam as having online changes so Desktop delta pulls it cleanly
  await sql`
    UPDATE portal_exams SET created_online = TRUE, updated_at = NOW()
    WHERE school_id = ${session.schoolId}::uuid AND local_id = ${examLocalId}
  `;

  return NextResponse.json(
    {
      ok: true,
      added: prepared.length,
      message: prepared.length === 1 ? "Question added." : `Imported ${prepared.length} questions.`,
    },
    { status: 201 }
  );
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ examId: string }> }
) {
  const gate = await requirePortalAccess(req, ["teacher", "admin"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  const { examId } = await context.params;
  const examLocalId = Number(examId);
  const check = await verifyExamOwnership(session.schoolId, examLocalId, session.role, session.localId);
  if (!check.ok) return NextResponse.json({ ok: false, message: check.message }, { status: check.status });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const qLocalId = Number(body?.local_id);
  if (!Number.isInteger(qLocalId) || qLocalId <= 0) {
    return NextResponse.json({ ok: false, message: "Invalid question local_id." }, { status: 400 });
  }

  const question = String(body?.question || "").trim();
  const o1 = String(body?.option1 || "").trim();
  const o2 = String(body?.option2 || "").trim();
  const o3 = String(body?.option3 || "").trim();
  const o4 = String(body?.option4 || "").trim();
  let ans = String(body?.answer || "").trim();
  const up = ans.toUpperCase();
  if (up === "A" && o1) ans = o1;
  else if (up === "B" && o2) ans = o2;
  else if (up === "C" && o3) ans = o3;
  else if (up === "D" && o4) ans = o4;
  const explanation = String(body?.explanation || "").trim();
  const sectionLocalId = body?.section_local_id ? Number(body.section_local_id) : null;
  const groupLocalId = body?.group_local_id ? Number(body.group_local_id) : null;
  const mandatory = Boolean(body?.mandatory);

  if (!question || !o1 || !o2) {
    return NextResponse.json({ ok: false, message: "Question text and Options A & B are required." }, { status: 400 });
  }

  const sql = getSql();
  await sql`
    UPDATE portal_questions
    SET question = ${question}, option1 = ${o1}, option2 = ${o2}, option3 = ${o3}, option4 = ${o4},
        answer = ${ans || o1}, explanation = ${explanation},
        section_local_id = ${sectionLocalId}, group_local_id = ${groupLocalId},
        mandatory = ${mandatory}, created_online = TRUE, updated_at = NOW()
    WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${examLocalId} AND local_id = ${qLocalId}
  `;

  return NextResponse.json({ ok: true, message: "Question updated." });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ examId: string }> }
) {
  const gate = await requirePortalAccess(req, ["teacher", "admin"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  const { examId } = await context.params;
  const examLocalId = Number(examId);
  const check = await verifyExamOwnership(session.schoolId, examLocalId, session.role, session.localId);
  if (!check.ok) return NextResponse.json({ ok: false, message: check.message }, { status: check.status });

  const qLocalId = Number(req.nextUrl.searchParams.get("local_id"));
  if (!Number.isInteger(qLocalId) || qLocalId <= 0) {
    return NextResponse.json({ ok: false, message: "Invalid question local_id." }, { status: 400 });
  }

  const sql = getSql();
  await sql`
    DELETE FROM portal_questions
    WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${examLocalId} AND local_id = ${qLocalId}
  `;
  return NextResponse.json({ ok: true, message: "Question removed." });
}

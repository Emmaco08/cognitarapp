/**
 * Single source of truth for CogniTara's editorial pages:
 * /roadmap, /changelogs, /guides, /faq, /blog, /blog/[slug], /about, and /support.
 */

export interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  summary: string;
  newItems?: string[];
  improvedItems?: string[];
  fixedItems?: string[];
}

export const CHANGELOG_RELEASES: ChangelogRelease[] = [
  {
    version: "v2.4.0",
    date: "November 27, 2026",
    title: "Dedicated web-only checkout, signed PDF receipts & licence-key-only Desktop",
    summary:
      "All school licence purchases and renewals now happen exclusively on cognitara.net with hardened receipt security, downloadable PDF certificates, an upgraded discount & free voucher engine, and a cleaner distraction-free CogniTara Studio Desktop.",
    newItems: [
      "Dedicated /pay/checkout flow collecting only School Name and School Email, with a unified Discount Code & 100% Free Redeem Voucher input.",
      "Choreographed post-payment confirmation with an Obsidian Ed25519 Licence Card, one-click .cgnlic download, and server-generated downloadable PDF payment receipts.",
      "Upgraded HQ Redeem & Discount Code engine with plan eligibility, minimum order thresholds, start/expiry windows, per-email limits, CSV batch export, and a full Redemption Audit Log.",
    ],
    improvedItems: [
      "Removed in-app Plans & Billing menus from CogniTara Studio Desktop — schools activate or renew cleanly by pasting their Ed25519 licence key under Licence or directly on the Lock Screen.",
      "Hardened payment & receipt security with 128-bit references, HMAC-SHA256 receipt tokens, HttpOnly grant cookies, CSRF origin validation, and brute-force lockouts.",
    ],
  },
  {
    version: "v2.3.5",
    date: "November 26, 2026",
    title: "Pure monochrome interface, HQ physical reviews & editorial resource hub",
    summary:
      "Unified CogniTara Studio Desktop, every local CBT portal, and CogniTara Cloud under one calm pure black & warm cream-white palette, plus HQ-authored school testimonials.",
    newItems: [
      "Add physical & word-of-mouth school reviews directly from CogniTara HQ with 1–5 star ratings and instant landing page publishing.",
      "Dedicated Story, Roadmap, Updates, How-to Guides, FAQ, Blog, and Support pages built for school principals and ICT coordinators.",
      "Email-OTP self-service password reset and environment-variable super-admin recovery for CogniTara HQ.",
    ],
    improvedItems: [
      "Removed all chromatic status tints across Desktop Studio, Admin Control Center, Teacher Studio, Student Dashboard, and the Live Exam Room for distraction-free focus.",
      "Stepped editorial monochrome Chart.js analytics palettes and non-clipping grade distribution legends.",
      "Grayscale architectural photography on the local school sign-in portal.",
    ],
    fixedItems: [
      "Fixed school city/region metadata rendering on live landing page testimonials.",
      "Updated the E2E desktop exam suite to validate mandatory teacher full names during onboarding.",
    ],
  },
  {
    version: "v2.2.8",
    date: "November 26, 2026",
    title: "Strict Admin read-only exam oversight & spring-animated confirmation modals",
    summary:
      "Clearer separation between teacher exam authoring and administrator supervision, paired with tactile confirmation modals and slide-over drawers.",
    newItems: [
      "Hold-to-confirm destructive action guards for deleting exams, resetting warning logs, and clearing attempts.",
      "Slide-over Exam Details drawer inside the Admin Exam Control Center for fast paper preview without leaving the table.",
      "Full teacher and student name onboarding fields with instant duplicate-username detection.",
    ],
    improvedItems: [
      "Admin accounts now supervise, preview, activate, pause, and audit exams while teachers retain exclusive authoring ownership.",
      "Faster SQLite query performance on schools with 400+ completed examination attempts.",
    ],
    fixedItems: [
      "Fixed bank-transfer modal scroll overflow on compact 1024px lab monitors.",
      "Fixed CSRF validation edge cases when switching between Admin and Teacher portals in the same browser.",
    ],
  },
  {
    version: "v2.2.7",
    date: "November 25, 2026",
    title: "Native bundled Paystack checkout inside CogniTara Studio",
    summary:
      "Schools can now purchase or renew licences via instant bank transfer, card, USSD, or OPay without leaving the desktop app.",
    newItems: [
      "Dedicated Paystack-Titan virtual transfer account generation directly inside Studio Plans & Billing.",
      "Live payment verification polling with animated verified receipt slips and automatic Ed25519 licence activation.",
    ],
    improvedItems: [
      "Zero external browser popups required for bank transfers — complete transfer details and copy buttons live right inside Studio.",
      "Clearer renewal countdown rings showing remaining licence days and offline lease windows.",
    ],
  },
  {
    version: "v2.2.6",
    date: "November 25, 2026",
    title: "Custom Windows setup installer, resilient exam sessions & database indexing",
    summary:
      "A brand-new native Windows installer with automatic in-place updates and hardened session persistence for unstable power environments.",
    newItems: [
      "Custom native Windows installer (.exe) with smart upgrade detection that preserves your existing school exam.db and uploads.",
      "Built-in in-app updater in Studio Settings → Updates with version verification.",
    ],
    improvedItems: [
      "Resilient HMAC session cookie handling that tolerates minor Windows CMOS clock drift without logging students out mid-exam.",
      "Composite SQLite indexes across attempts, answers, and scores for instant 300-device concurrent saves.",
    ],
    fixedItems: [
      "Eliminated Set-Cookie header spam on static assets during peak exam start bursts.",
    ],
  },
  {
    version: "v2.2.5",
    date: "November 25, 2026",
    title: "Legacy school database migration & vault-safe restores",
    summary:
      "Upgrade smoothly from earlier CogniTara exam.db files with automatic schema inspection, dry-run previews, and pre-import safety snapshots.",
    newItems: [
      "One-click Legacy exam.db Migration inside Desktop Settings and Admin School Settings.",
      "Automatic pre-migration backup snapshot saved before importing historical students, teachers, exams, and scores.",
    ],
    improvedItems: [
      "Automatic schema reconciliation for missing specialisation, grading scale, and section columns from older school databases.",
    ],
  },
  {
    version: "v2.2.4",
    date: "November 25, 2026",
    title: "Offline KaTeX + mhchem Formula Studio & in-app Cloud Reviews",
    summary:
      "Visual formula authoring for Math, Physics, and Chemistry teachers without memorizing raw LaTeX, plus direct school feedback from Studio.",
    newItems: [
      "Visual Formula Builder modal with fraction, root, exponent, subscript, and chemistry templates plus live student preview.",
      "Cloud & Rate view inside CogniTara Studio Desktop for encrypted cloud backup sync and verified school reviews.",
    ],
    improvedItems: [
      "Floating scientific calculator inside the student exam room with draggable positioning and instant degree/radian evaluation.",
    ],
  },
];

export type RoadmapStatus = "shipped" | "in_progress" | "planned" | "exploring";

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  category: string;
  target: string;
}

export const ROADMAP_ITEMS: RoadmapItem[] = [
  {
    id: "rm-cross-device",
    title: "Cross-Device Exam Continuity & 90s Power-Cut Grace",
    description:
      "When a student's PC shuts down, battery dies, or browser freezes mid-exam, they sign in on another lab computer and pick up on the exact question with every saved answer and remaining second intact.",
    status: "shipped",
    category: "Exam Reliability",
    target: "Live in v2.2+",
  },
  {
    id: "rm-monochrome",
    title: "Pure Monochrome Editorial Interface (Desktop, Portals & Cloud)",
    description:
      "Calm, high-contrast black and warm cream-white workspace designed to reduce eye fatigue during 2-hour terminal exams and full-day marking sessions.",
    status: "shipped",
    category: "Design Craft",
    target: "Live in v2.3.5",
  },
  {
    id: "rm-hq-reviews",
    title: "HQ Physical School Reviews & Lead-Capture Downloads",
    description:
      "Record verified word-of-mouth reviews from school visits directly in HQ, email latest Windows installer links to principals, and control seasonal promo banners & trial days live.",
    status: "shipped",
    category: "Cloud & HQ",
    target: "Live in v2.3.5",
  },
  {
    id: "rm-katex-calc",
    title: "Offline KaTeX + mhchem Formula Studio & Scientific Calculator",
    description:
      "Visual equation builder for Mathematics, Physics, and Chemistry teachers paired with a floating scientific calculator right inside the exam room.",
    status: "shipped",
    category: "STEM Authoring",
    target: "Live in v2.2.4",
  },
  {
    id: "rm-theory-grading",
    title: "Hybrid Objective + Structured Theory Grading Workspace",
    description:
      "Side-by-side rubric marking queue for teachers to grade typed short-answer and essay questions alongside auto-graded objective sections on a single broadsheet.",
    status: "in_progress",
    category: "Assessment",
    target: "v2.4",
  },
  {
    id: "rm-seating-audit",
    title: "Live Classroom Seat Map & Signal Telemetry",
    description:
      "Real-time visual grid in Admin Live Support showing each active student's progress bar, heartbeat latency, warning count, and one-click +5m extension.",
    status: "in_progress",
    category: "Invigilation",
    target: "v2.4",
  },
  {
    id: "rm-word-import",
    title: "Direct .DOCX Word Question Paper Importer",
    description:
      "Upload an existing Microsoft Word exam paper with numbered questions, bolded answer keys, and embedded diagrams — automatically parsed into sections.",
    status: "planned",
    category: "Authoring",
    target: "v2.5",
  },
  {
    id: "rm-parent-sms",
    title: "Offline Result Slip Batch PDF & Parent Export Pack",
    description:
      "Generate a single merged print-ready PDF of official termly CBT score slips per class with school crest, principal signature line, and subject breakdown.",
    status: "planned",
    category: "Reporting",
    target: "v2.5",
  },
  {
    id: "rm-audio-listening",
    title: "Local LAN Audio Listening Comprehension Clips",
    description:
      "Attach compressed audio prompts for French, English Oral, and language exams served cleanly over school Wi-Fi with configurable replay limits.",
    status: "planned",
    category: "Exam Formats",
    target: "v2.6",
  },
  {
    id: "rm-multi-lab-sync",
    title: "Multi-Building Campus Sync Bridge",
    description:
      "Merge completed examination scripts from two separate offline exam halls onto one master school server at the end of exam day.",
    status: "exploring",
    category: "Large Campuses",
    target: "Future",
  },
  {
    id: "rm-offline-kiosk",
    title: "Optional Locked Exam Browser Wrapper for Windows Labs",
    description:
      "Lightweight kiosk launcher for school-owned lab PCs that locks taskbar shortcuts and Alt+Tab cleanly during high-stakes mock exams.",
    status: "exploring",
    category: "Integrity",
    target: "Future",
  },
];

export interface GuideItem {
  id: string;
  category: string;
  title: string;
  readTime: string;
  summary: string;
  steps: string[];
  tip?: string;
}

export const GUIDE_CATEGORIES = [
  { name: "Get started", description: "Install on one Windows PC and launch your first local exam server." },
  { name: "Exam day & recovery", description: "Cross-device handoff, NEPA power cuts, and live hall pause controls." },
  { name: "Authoring & STEM", description: "KaTeX formulas, CSV question import, and randomized sections." },
  { name: "Networking & Wi-Fi", description: "Connect up to 300 laptops, Chromebooks, and tablets without internet." },
  { name: "Data & backups", description: "30-minute auto-backups, encrypted cloud vault, and legacy DB migration." },
  { name: "Licensing", description: "Free trial activation, Paystack checkout, and offline Ed25519 keys." },
];

export const GUIDES_LIST: GuideItem[] = [
  {
    id: "install-first-server",
    category: "Get started",
    title: "Install CogniTara Studio on one Windows PC in 5 minutes",
    readTime: "3 min",
    summary: "Go from download to a live school exam network with zero technical server setup.",
    steps: [
      "Visit cognitara.net/download, enter your school email, and click the instant Windows installer link delivered to your inbox.",
      "Run CogniTara Studio Setup on one Windows 10 or 11 (64-bit) lab computer — no Python, XAMPP, or database installation required.",
      "Complete the quick 3-step onboarding: set your school name, crest initials, term/session, and create your local Admin username and password.",
      "Click Start Server on the Server home screen. CogniTara automatically detects your school router LAN address (for example http://192.168.10.24:5000) and generates a scannable QR code.",
    ],
    tip: "Connect the host PC to your school Wi-Fi router via an Ethernet cable when hosting 100+ students for rock-solid local throughput.",
  },
  {
    id: "onboard-teachers-students",
    category: "Get started",
    title: "Add teachers, approve student registrations, and assign classes",
    readTime: "3 min",
    summary: "Prepare your academic classes, subjects, teacher accounts, and candidate rosters ahead of exam week.",
    steps: [
      "Sign in to the Admin Control Center from your host PC browser and open School Settings to verify classes (JSS 1–SS 3) and grading scales.",
      "Create teacher accounts with full names and assigned subjects, or import your entire student roster via CSV.",
      "Enable self-registration during onboarding week so students create accounts on lab PCs, then bulk-approve them in Pending Approvals.",
      "For external admission tests, open Common Entrance to generate standalone candidate PIN slips without mixing applicants into regular classes.",
    ],
  },
  {
    id: "cross-device-recovery",
    category: "Exam day & recovery",
    title: "Continue an exam on another computer when a PC dies mid-test",
    readTime: "2 min",
    summary: "How CogniTara's authoritative server state saves every student answer so hardware failures never ruin a sitting.",
    steps: [
      "Every time a student selects option A, B, C, or D, the answer writes immediately to the host PC's SQLite WAL database — nothing important lives only in browser memory.",
      "If a student's desktop loses power, freezes, or runs out of battery, the server's heartbeat monitor detects the drop and protects their remaining exam clock cleanly.",
      "Seat the student at any spare laptop, desktop, Chromebook, or tablet connected to the same school Wi-Fi and open the server LAN URL.",
      "Have the student sign in with their exact username and password. Their Student Dashboard displays a prominent Resume Exam button — clicking it returns them to their saved answers and remaining seconds.",
    ],
    tip: "If the previous PC is still awake on the network, CogniTara's Single-Session Fence automatically blocks duplicate active logins so only one machine writes to the script.",
  },
  {
    id: "live-hall-pause",
    category: "Exam day & recovery",
    title: "Pause the entire hall during a generator switchover or add extra time",
    readTime: "2 min",
    summary: "Use Admin Live Support & Pause to control timers across 300 active students in real time.",
    steps: [
      "Open Admin → Live Support & Pause (or press Ctrl+K and type Live Support).",
      "To freeze every active countdown across the examination hall during an announcement or generator switchover, click Pause All Exams.",
      "When power or order is restored, click Resume All — every student's countdown resumes smoothly from the exact second it paused.",
      "For an individual student who arrived late or experienced a workstation swap, click +5 min / +10 min or Reset Warnings right beside their name.",
    ],
  },
  {
    id: "wifi-300-devices",
    category: "Networking & Wi-Fi",
    title: "Connect up to 300 student devices over school Wi-Fi with zero internet",
    readTime: "4 min",
    summary: "Set up a reliable offline LAN exam hall using a standard dual-band router or access points.",
    steps: [
      "Plug your Windows host PC into your school router or switch using a standard LAN (Ethernet) cable — no SIM card or active ISP subscription is needed.",
      "Have student laptops, Chromebooks, iPads, or tablets join the school Wi-Fi SSID (even if the device says 'Connected, no internet' — that is expected and ideal!).",
      "Display the server QR code or write the LAN address (e.g. http://192.168.1.50:5000) on the whiteboard.",
      "Students open Chrome, Edge, or Safari and enter that address directly in the address bar — no student app install needed.",
    ],
    tip: "For 100+ simultaneous students, use two or three access points wired to the same LAN switch on different Wi-Fi channels (1, 6, 11) so wireless airtime stays fast.",
  },
  {
    id: "static-ip-firewall",
    category: "Networking & Wi-Fi",
    title: "Keep one permanent LAN URL and allow Windows Firewall cleanly",
    readTime: "2 min",
    summary: "Avoid typing a new IP address every morning by reserving your host PC IP on the school router.",
    steps: [
      "Open your school router admin panel (usually 192.168.0.1 or 192.168.1.1) and open DHCP Address Reservation.",
      "Bind your Windows host PC's MAC address to a fixed local IP such as 192.168.1.50 so the exam URL never changes across reboots.",
      "When Windows Firewall prompts on first launch of CogniTara Studio, allow Private Networks access on port 5000.",
      "Bookmark http://192.168.1.50:5000 on every lab desktop so students open the exam portal in one click.",
    ],
  },
  {
    id: "katex-formulas-csv",
    category: "Authoring & STEM",
    title: "Author Mathematics & Chemistry formulas offline (or bulk import CSV)",
    readTime: "3 min",
    summary: "Create publication-grade fractions, roots, integrals, and chemical equations without memorizing LaTeX.",
    steps: [
      "Sign in to the Teacher Studio, open an exam's Question Manager, and click Formula Builder above the question editor.",
      "Choose a template tab (Fraction, Root, Power, Subscript, Chem H₂O, or Custom TeX), fill in the boxes, and verify the instant Live Preview.",
      "Click Insert into Question — CogniTara bundles KaTeX and mhchem locally so formulas render crisply offline on every student screen.",
      "To upload 50+ questions at once, click Download CSV Formula Template, fill your spreadsheet, and import the entire paper in one click.",
    ],
  },
  {
    id: "shuffled-anti-cheat",
    category: "Authoring & STEM",
    title: "Randomize question order, shuffle A–D options, and set integrity limits",
    readTime: "2 min",
    summary: "Prevent side-by-side copying by giving every seat a unique question sequence and option layout.",
    steps: [
      "Open Exam Settings for any paper in Teacher Studio and enable Randomize Questions and Shuffle Answer Options.",
      "Add 80 questions to a section and set 'Questions to Show = 50' so each student draws a unique 50-question paper from the pool.",
      "Configure the warning limit (default: 5 tab-switch or focus-loss warnings before automatic submission) and toggle the built-in Basic or Scientific Calculator.",
    ],
  },
  {
    id: "backups-and-migration",
    category: "Data & backups",
    title: "Automatic 30-minute backups, Cloud Vault snapshots & legacy exam.db migration",
    readTime: "3 min",
    summary: "Keep years of student transcripts safe against disk failure or PC replacement.",
    steps: [
      "CogniTara Studio automatically creates dated SQLite WAL backups every 30 minutes in your configured local backup folder (default: C:\\CogniTara\\Backups).",
      "Sign in to your school Cloud account inside Studio → Cloud & Rate to upload encrypted snapshots to CogniTara Cloud whenever internet is available.",
      "Upgrading from an older CogniTara version? Open Studio Settings → Legacy Database Migration, pick your old exam.db, preview the student/exam counts, and import with automatic pre-migration safety backup.",
    ],
  },
  {
    id: "export-score-broadsheets",
    category: "Data & backups",
    title: "Export WAEC/NECO grade broadsheets and printable official score slips",
    readTime: "2 min",
    summary: "Download class spreadsheets and institutional result sheets the second students submit.",
    steps: [
      "Open Admin → Results & Exports or Teacher → Results for any completed examination.",
      "Filter by class, term, or subject to review individual answers, accuracy breakdowns, and A1–F9 letter grades.",
      "Click Export CSV Broadsheet for Excel/report-card import, or open any candidate row to print a clean official result slip.",
    ],
  },
  {
    id: "activate-offline-license",
    category: "Licensing",
    title: "Buy a school licence via Paystack and activate offline Ed25519 keys",
    readTime: "2 min",
    summary: "One institutional licence covers unlimited students, teachers, and exams — zero per-student charges.",
    steps: [
      "Visit cognitara.net/license and pick Monthly, Termly, Annual, or Lifetime to open our dedicated secure checkout page.",
      "Enter your school name and email address (plus any discount code or 100% free redeem voucher) and complete payment via Paystack (Card, Bank Transfer, USSD, or OPay).",
      "As soon as payment confirms, your cryptographically signed Ed25519 licence key and downloadable PDF payment receipt appear immediately on screen and arrive in your school email.",
      "Open CogniTara Studio Desktop → Licence, paste your licence key (or import the .cgnlic file), and click Activate. Your server then runs completely offline for the full lease window (7 to 90 days per check-in).",
    ],
  },
  {
    id: "transfer-host-pc-license",
    category: "Licensing",
    title: "Start a free school trial or move your licence to a replacement host PC",
    readTime: "2 min",
    summary: "How hardware-bound licences work when you upgrade or replace your main exam server computer.",
    steps: [
      "New schools can activate a free trial directly on cognitara.net/license or inside CogniTara Studio whenever trial activation is enabled.",
      "Each licence binds securely to your host Windows PC hardware fingerprint so offline leases cannot be tampered with.",
      "If your school replaces its main server PC, email support@cognitara.net with your school email and licence key (or open your Cloud Dashboard) to reset the hardware slot and reactivate on the new PC in minutes.",
    ],
  },
];

export interface FaqCategory {
  category: string;
  items: { q: string; a: string }[];
}

export const FAQ_GROUPS: FaqCategory[] = [
  {
    category: "Offline & Exam Reliability",
    items: [
      {
        q: "Does CogniTara require internet access during exams?",
        a: "No. Once CogniTara Studio is installed and activated on one Windows PC, every exam runs 100% over your local school Wi-Fi or Ethernet LAN. Even if your school has zero internet connection for weeks, students can log in, write exams, use the scientific calculator, and receive graded score slips.",
      },
      {
        q: "What happens if a student's computer dies, freezes, or loses power mid-exam?",
        a: "Nothing is lost. Every single answer click saves immediately to the host PC's SQLite WAL database. The student simply moves to another computer, laptop, or tablet on the school network, signs back in with their username and password, and clicks Resume Exam to continue on the exact question and remaining second.",
      },
      {
        q: "What if NEPA cuts power across the entire exam hall?",
        a: "If your host laptop is on battery (or your desktop host has a small UPS), CogniTara stays online and automatically protects disconnected student timers with a 90-second grace pause. Administrators can also click Pause All Exams in one click during a generator switchover and resume everyone cleanly together.",
      },
      {
        q: "How many students can write an exam at the same time on one PC?",
        a: "A standard modern Windows 10/11 PC (8 GB RAM, SSD, connected via Ethernet to your router) comfortably serves 150 to 300 concurrent students over local LAN with sub-50ms answer saves.",
      },
    ],
  },
  {
    category: "Student Devices & Anti-Cheat",
    items: [
      {
        q: "Do we need to install software on every student computer or tablet?",
        a: "No. Students only need a normal web browser (Chrome, Edge, Safari, or Firefox). They open your host PC's local LAN address or scan the QR code — works seamlessly on Windows desktops, Chromebooks, MacBooks, iPads, and Android tablets.",
      },
      {
        q: "How does CogniTara prevent cheating and students copying neighbors?",
        a: "Three layers work together: (1) Per-student randomized question subsets and shuffled A/B/C/D options so adjacent seats never share the same paper order; (2) Real-time tab-switch & focus-loss warning tracking with automatic submission at your chosen threshold; (3) Single-Session Fence that prevents two devices from logging into the same student account simultaneously.",
      },
      {
        q: "Does it support WAEC/NECO Math, Physics, and Chemistry equations?",
        a: "Yes. CogniTara ships with an offline KaTeX + mhchem Formula Builder for teachers and renders crisp mathematical fractions, integrals, matrices, and chemical equations on student screens without internet. Teachers can also toggle a built-in Basic or Scientific Calculator per exam.",
      },
    ],
  },
  {
    category: "Data Ownership & Backups",
    items: [
      {
        q: "Where do our school's student records, questions, and results live?",
        a: "On your own school PC inside a standard SQLite database (C:\\CogniTara\\exam.db). Your question banks and student grades never depend on a third-party cloud to run. You own your data completely.",
      },
      {
        q: "What if our host Windows PC breaks or gets formatted?",
        a: "CogniTara automatically saves timestamped local backups every 30 minutes (which you can also copy to a flash drive) and lets you upload encrypted snapshots to CogniTara Cloud whenever internet is connected. Restoring onto a new PC takes under two minutes.",
      },
      {
        q: "Can we migrate our old CogniTara database without losing previous results?",
        a: "Yes. Studio Settings and Admin School Settings both include a guided Legacy exam.db Migration tool that previews your historical records, saves a safety snapshot first, and upgrades the schema cleanly.",
      },
    ],
  },
  {
    category: "Pricing, Trials & Licensing",
    items: [
      {
        q: "Do you charge per student or per exam sitting?",
        a: "Never. One institutional licence covers your entire school — unlimited students, unlimited teachers, unlimited question banks, and unlimited exam sittings across regular classes and Common Entrance.",
      },
      {
        q: "How do offline Ed25519 licence leases work?",
        a: "When you activate your key, CogniTara stores a cryptographically signed hardware-bound licence token in a 5-layer local vault. Depending on your plan, your server runs completely offline for 7 to 90 days between brief online check-ins.",
      },
      {
        q: "What payment methods are supported?",
        a: "All licence purchases and renewals happen securely on cognitara.net/license via Paystack using Bank Transfer, Debit/Credit Card, USSD, or OPay in NGN (₦) or USD ($). Discount codes and 100% free school redeem vouchers are also supported directly at checkout, with an instant downloadable PDF receipt.",
      },
    ],
  },
];

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  category: string;
  author: string;
  authorInitials: string;
  readTime: string;
  sections: { heading?: string; paragraphs: string[] }[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "cross-device-exam-continuity-when-a-pc-dies",
    title: "What happens when a student's computer dies 20 minutes into a final exam?",
    excerpt:
      "Why browser-only CBT platforms fail real school labs — and how CogniTara's write-through SQLite WAL state lets any student walk to a spare PC and resume on the exact second.",
    date: "Nov 24, 2026",
    category: "Exam Reliability",
    author: "Emmanuel",
    authorInitials: "EM",
    readTime: "4 min read",
    sections: [
      {
        paragraphs: [
          "Anyone who has invigilated a 200-student CBT exam in a real secondary school lab knows the moment. Twenty-two minutes into Mathematics, a desktop in Row 3 shuts off completely — loose power cable, dead battery, or a frozen browser tab.",
          "With typical cloud or client-cached CBT apps, that single hardware glitch turns into panic: lost answers, a ticking clock that keeps draining while the ICT teacher scrambles, or worse, a duplicate login lockout that blocks the student from signing in elsewhere.",
        ],
      },
      {
        heading: "Authoritative server state on every single click",
        paragraphs: [
          "In CogniTara, the browser is never the source of truth. Every time a student selects option A, B, C, or D, the client immediately persists that choice to the local host PC's SQLite WAL database over LAN in under 30 milliseconds.",
          "Meanwhile, the exam timer is computed authoritatively on the host server and synced via lightweight heartbeats. If a student's workstation suddenly disappears from the network, CogniTara detects the stale heartbeat and protects their remaining time rather than letting their clock run out silently.",
        ],
      },
      {
        heading: "Walk to another desk, sign in, keep writing",
        paragraphs: [
          "Recovery takes fifteen seconds. The invigilator directs the student to any spare laptop, desktop, or tablet on the same school Wi-Fi. When the student signs in, CogniTara's Single-Session Fence cleanly hands the active attempt over to the new browser and invalidates the dead session.",
          "The Student Dashboard immediately surfaces a Resume Exam card. One click brings back every previously selected option, section progress, and exact remaining seconds — turning a potential exam crisis into a calm non-event.",
        ],
      },
    ],
  },
  {
    slug: "why-offline-lan-beats-cloud-cbt-for-300-students",
    title: "Why one local Windows PC beats cloud CBT when 300 students click Start at 9:00 AM",
    excerpt:
      "School Wi-Fi bottlenecks aren't caused by hardware — they happen when 300 devices fight over a single mobile router to reach a remote internet server.",
    date: "Nov 18, 2026",
    category: "Engineering",
    author: "Emmanuel",
    authorInitials: "EM",
    readTime: "5 min read",
    sections: [
      {
        paragraphs: [
          "Many schools buy fast laptops and assume a cloud-hosted CBT website will work smoothly — until exam morning arrives. At 9:00 AM, 250 students press Start Examination within the same 10 seconds, all sharing one 4G router or modest school fiber line.",
          "Images stall, math formulas fail to load from external CDNs, answers time out, and students stare at spinning loaders while their countdown keeps burning.",
        ],
      },
      {
        heading: "Keep traffic inside the room",
        paragraphs: [
          "A standard local Wi-Fi router moves traffic inside your school building at hundreds of megabits per second — completely independent of your ISP, mobile data balance, or external CDN outages.",
          "CogniTara Studio turns one existing Windows 10 or 11 lab computer into a dedicated local examination server. Every asset — fonts, icons, KaTeX math renderer, scientific calculator, and question diagrams — is served directly from disk over local LAN.",
        ],
      },
      {
        heading: "Cloud only when you actually want it",
        paragraphs: [
          "Local-first does not mean isolated. Whenever the host PC has internet after exams finish, CogniTara Studio lets you upload encrypted SQLite backups to CogniTara Cloud, check for app updates, and renew licences via Paystack — without ever putting live exam day at the mercy of internet uptime.",
        ],
      },
    ],
  },
  {
    slug: "designing-a-calm-monochrome-examination-room",
    title: "Why we removed every distracting color from CogniTara's exam room and dashboards",
    excerpt:
      "Examinations are high-focus moments. Here is why pure obsidian ink on warm cream-white paper reduces cognitive fatigue for students, teachers, and administrators.",
    date: "Nov 26, 2026",
    category: "Releases",
    author: "Emmanuel",
    authorInitials: "EM",
    readTime: "3 min read",
    sections: [
      {
        paragraphs: [
          "Most school software looks loud: neon gradients, warning banners shouting in orange, bright green pills competing with blue action buttons. During a two-hour examination or a long evening of uploading 400 Physics questions, that visual noise quietly drains attention.",
          "With CogniTara v2.3.5, we rebuilt every surface — Desktop Studio, Admin Control Center, Teacher Studio, Student Dashboard, Live Exam Room, and Cloud HQ — around a restrained pure black and warm cream-white editorial palette.",
        ],
      },
      {
        heading: "Clarity through hierarchy, not rainbow badges",
        paragraphs: [
          "On a cream-white canvas (#F8F8F8), high-contrast obsidian ink (#171614) gives question text and mathematical notation the calm legibility of printed paper. Primary actions stand out effortlessly without neon glare, and Dark Mode remains one click away for dimly lit labs.",
        ],
      },
    ],
  },
  {
    slug: "migrating-legacy-school-exam-databases-safely",
    title: "How to upgrade older school exam databases without losing a single student transcript",
    excerpt:
      "Inside CogniTara's vault-safe migration pipeline: automatic pre-import backups, dry-run inspection, and zero-loss schema reconciliation.",
    date: "Nov 25, 2026",
    category: "Migration",
    author: "Emmanuel",
    authorInitials: "EM",
    readTime: "3 min read",
    sections: [
      {
        paragraphs: [
          "Schools accumulate years of valuable academic history: student admission numbers, carefully proofread WAEC-style question banks, and term-by-term score transcripts. Upgrading examination software should never force an ICT coordinator to start from a blank slate.",
        ],
      },
      {
        heading: "Preview first, snapshot automatically",
        paragraphs: [
          "When you select an older exam.db file inside CogniTara Studio Settings or Admin School Settings, CogniTara inspects the schema in read-only mode first and reports the exact counts of students, teachers, exams, questions, and scores found inside.",
          "Before writing a single byte, CogniTara archives your current database into a timestamped backup folder, reconciles missing modern columns automatically, and verifies SQLite integrity so your historical records stay intact.",
        ],
      },
    ],
  },
];

export interface AboutPageContent {
  badge: string;
  title: string;
  lead: string;
  paragraphs: string[];
  signatureName: string;
  signatureRole: string;
  contactNote: string;
}

export const ABOUT_PAGE_DEFAULT: AboutPageContent = {
  badge: "Story",
  title: "The idea behind CogniTara",
  lead: "Why we're building an examination tool that never makes you worry about exam day.",
  paragraphs: [
    "Every term, schools try to run computer-based exams on cloud websites designed for fiber-connected offices. Everything looks fine during a two-laptop test — until exam morning arrives and 200 students press Start at 9:00 AM over one shared router.",
    "Pages stall, math equations fail to load, and when a lab computer shuts off in row three, a student watches their progress disappear while their countdown keeps burning.",
    "That's why we started building CogniTara.",
    "CogniTara is a local-first examination server built for real school labs. You install CogniTara Studio on one Windows PC, connect it to your school Wi-Fi, and immediately serve up to 300 student laptops, Chromebooks, tablets, and phones with zero internet required.",
    "Every click writes straight to SQLite WAL on your own machine. If a computer dies mid-exam, the student walks to a spare desk, signs in, and continues on the exact question and remaining second. If NEPA cuts power during a generator switchover, an administrator pauses the entire hall in one click.",
    "Our vision with CogniTara is simple: give every school calm, institutional examination infrastructure — owned locally on your hardware, without per-student fees, ready whenever exam week arrives.",
  ],
  signatureName: "Emmanuel",
  signatureRole: "Founder & Lead Engineer",
  contactNote: "Want to chat? Email support@cognitara.net or explore our guides.",
};

export interface SupportPageContent {
  badge: string;
  title: string;
  lead: string;
  email: string;
  responseWindow: string;
  bugChecklist: string[];
}

export const SUPPORT_CHANNELS = {
  badge: "Get support",
  title: "Get in touch",
  lead: "CogniTara is built and supported directly by the team behind it. Every message gets a real reply.",
  email: "support@cognitara.net",
  whatsappLabel: "Direct Onboarding & Exam-Day Support",
  responseWindow: "We typically reply within 2–6 hours on school days (priority during exam weeks).",
  bugChecklist: [
    "CogniTara Studio version (Settings → About / Updates)",
    "Windows version (Windows 10 or Windows 11, 64-bit)",
    "Approximate number of student devices connected on your LAN",
    "What happened vs. what you expected (and any message on screen)",
  ],
};


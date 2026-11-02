# CogniTara Examination Portal — Complete Route Map

This document lists all **203 registered endpoints** in the CogniTara modular application, cataloged by Blueprint, URL pattern, permitted HTTP methods, handler endpoint, and source file.

## Route Summary by Module

| Blueprint | Module Title | Source File | Route Count |
| :--- | :--- | :--- | :---: |
| home | Home & General Utilities | cognitara/routes/home.py | 4 |
| auth | Authentication & Session Management | cognitara/routes/auth.py | 4 |
| student | Student Dashboard & Common Entrance Entry | cognitara/routes/student.py | 4 |
| exam_regular | Regular Examination Delivery Engine | cognitara/routes/examinations/regular.py | 15 |
| exam_ce | Common Entrance Examination Delivery Engine | cognitara/routes/examinations/common_entrance.py | 13 |
| teacher | Teacher Management & Question Authoring Portal | cognitara/routes/teacher.py | 47 |
| admin_dashboard | Admin Dashboard & General Overview | cognitara/routes/admin/dashboard.py | 6 |
| admin_users | Admin User Management (Students, Teachers, Admins) | cognitara/routes/admin/users.py | 11 |
| admin_support | Admin Technical Support & Audit Logging | cognitara/routes/admin/support.py | 11 |
| admin_exams | Admin Regular Exam Management & Section Builder | cognitara/routes/admin/exams.py | 19 |
| admin_results | Admin Results, Analytics & Grade Sheet Export | cognitara/routes/admin/results.py | 5 |
| admin_ce | Admin Common Entrance Comprehensive Management | cognitara/routes/admin/common_entrance.py | 63 |
| global | Global Static & File Handlers | Flask Built-in | 1 |
| **Total** | | | **203** |

---

## Home & General Utilities (home)

**Source File:** [cognitara/routes/home.py](file:///cognitara/routes/home.py)

| URL Pattern | Methods | Endpoint Handler |
| :--- | :--- | :--- |
| / | GET | home.start |
| /api/calculate | POST | home.api_calculate |
| /api/stats | GET | home.api_stats |
| /avatar | GET | home.avatar |

---

## Authentication & Session Management (auth)

**Source File:** [cognitara/routes/auth.py](file:///cognitara/routes/auth.py)

| URL Pattern | Methods | Endpoint Handler |
| :--- | :--- | :--- |
| /ce_login | GET, POST | auth.ce_login_page |
| /login | GET, POST | auth.login |
| /logout | GET | auth.logout |
| /register | GET, POST | auth.register |

---

## Student Dashboard & Common Entrance Entry (student)

**Source File:** [cognitara/routes/student.py](file:///cognitara/routes/student.py)

| URL Pattern | Methods | Endpoint Handler |
| :--- | :--- | :--- |
| /ce_dashboard | GET | student.ce_dashboard_page |
| /ce_start | GET | student.ce_start_exam |
| /ce_submitted | GET | student.ce_submitted |
| /dashboard | GET | student.dashboard |

---

## Regular Examination Delivery Engine (exam_regular)

**Source File:** [cognitara/routes/examinations/regular.py](file:///cognitara/routes/examinations/regular.py)

| URL Pattern | Methods | Endpoint Handler |
| :--- | :--- | :--- |
| /exam/<int:exam_id> | GET, POST | exam_regular.exam_page |
| /exam_auto_save | POST | exam_regular.exam_auto_save |
| /exam_auto_submit_close | POST | exam_regular.exam_auto_submit_close |
| /exam_begin/<int:exam_id> | GET | exam_regular.exam_begin |
| /exam_check_active_session/<int:attempt_id> | GET | exam_regular.exam_check_active_session |
| /exam_check_pause/<int:attempt_id> | GET | exam_regular.exam_check_pause |
| /exam_check_resume_approved/<int:attempt_id> | GET | exam_regular.exam_check_resume_approved |
| /exam_clear_auto_lock/<int:attempt_id> | POST | exam_regular.exam_clear_auto_lock |
| /exam_get_state/<int:attempt_id> | GET | exam_regular.exam_get_state |
| /exam_heartbeat | POST | exam_regular.exam_heartbeat |
| /exam_request_resume | POST | exam_regular.exam_request_resume |
| /exam_save_single_answer | POST | exam_regular.exam_save_single_answer |
| /exam_start/<int:exam_id> | GET | exam_regular.exam_start |
| /log_warning | POST | exam_regular.log_warning |
| /result/<int:exam_id> | GET | exam_regular.result |

---

## Common Entrance Examination Delivery Engine (exam_ce)

**Source File:** [cognitara/routes/examinations/common_entrance.py](file:///cognitara/routes/examinations/common_entrance.py)

| URL Pattern | Methods | Endpoint Handler |
| :--- | :--- | :--- |
| /ce_auto_save | POST | exam_ce.ce_auto_save |
| /ce_auto_submit_close | POST | exam_ce.ce_auto_submit_close |
| /ce_check_active_session/<int:attempt_id> | GET | exam_ce.ce_check_active_session |
| /ce_check_pause/<int:attempt_id> | GET | exam_ce.ce_check_pause |
| /ce_check_resume_approved/<int:attempt_id> | GET | exam_ce.ce_check_resume_approved |
| /ce_clear_auto_lock/<int:attempt_id> | POST | exam_ce.ce_clear_auto_lock |
| /ce_exam/<int:attempt_id> | GET, POST | exam_ce.ce_exam_page |
| /ce_get_exam_state/<int:attempt_id> | GET | exam_ce.ce_get_exam_state |
| /ce_get_saved_state/<int:attempt_id> | GET | exam_ce.ce_get_saved_state |
| /ce_heartbeat | POST | exam_ce.ce_heartbeat |
| /ce_log_warning | POST | exam_ce.ce_log_warning |
| /ce_request_resume | POST | exam_ce.ce_request_resume |
| /ce_save_single_answer | POST | exam_ce.ce_save_single_answer |

---

## Teacher Management & Question Authoring Portal (teacher)

**Source File:** [cognitara/routes/teacher.py](file:///cognitara/routes/teacher.py)

| URL Pattern | Methods | Endpoint Handler |
| :--- | :--- | :--- |
| /teacher | GET | teacher.teacher_dashboard |
| /teacher/add_exam | GET, POST | teacher.teacher_add_exam |
| /teacher/add_time/<int:attempt_id>/<int:extra_minutes> | POST | teacher.add_exam_time |
| /teacher/analytics | GET | teacher.teacher_analytics |
| /teacher/create_exam | GET | teacher.teacher_create_exam |
| /teacher/create_exam | POST | teacher.teacher_create_exam_post |
| /teacher/delete_exam/<int:exam_id> | POST | teacher.teacher_delete_exam |
| /teacher/download_builder | GET | teacher.teacher_download_builder |
| /teacher/exam/<int:exam_id>/analytics | GET | teacher.exam_analytics |
| /teacher/exam/<int:exam_id>/sections | POST | teacher.add_exam_section |
| /teacher/exam/<int:exam_id>/settings | GET | teacher.teacher_exam_settings |
| /teacher/exam/<int:exam_id>/settings | POST | teacher.teacher_exam_settings_update |
| /teacher/exam/<int:exam_id>/settings | GET | teacher.exam_settings_page |
| /teacher/exam_add_time/<int:attempt_id>/<int:minutes> | POST | teacher.teacher_exam_add_time |
| /teacher/exam_force_submit/<int:attempt_id> | POST | teacher.teacher_exam_force_submit |
| /teacher/exam_force_submit_all | POST | teacher.teacher_exam_force_submit_all |
| /teacher/exam_group/<int:group_id>/add_question | POST | teacher.add_question_to_exam_group |
| /teacher/exam_group/<int:group_id>/delete | GET | teacher.delete_exam_group |
| /teacher/exam_group/<int:group_id>/edit | GET, POST | teacher.edit_exam_group |
| /teacher/exam_group_question/<int:question_id>/edit | GET, POST | teacher.edit_exam_group_question |
| /teacher/exam_live_data | GET | teacher.teacher_exam_live_data |
| /teacher/exam_pause/<int:attempt_id> | POST | teacher.teacher_exam_pause |
| /teacher/exam_pause_all | POST | teacher.teacher_exam_pause_all |
| /teacher/exam_question/<int:question_id>/data | GET | teacher.exam_question_data |
| /teacher/exam_question/<int:question_id>/delete | GET | teacher.delete_exam_question |
| /teacher/exam_question/<int:question_id>/edit | GET, POST | teacher.edit_exam_question |
| /teacher/exam_question/<int:question_id>/remove_from_group | GET | teacher.remove_question_from_exam_group |
| /teacher/exam_reset_warnings/<int:attempt_id> | POST | teacher.teacher_exam_reset_warnings |
| /teacher/exam_resume/<int:attempt_id> | POST | teacher.teacher_exam_resume |
| /teacher/exam_resume_all | POST | teacher.teacher_exam_resume_all |
| /teacher/exam_section/<int:section_id>/delete | POST | teacher.delete_exam_section |
| /teacher/exam_section/<int:section_id>/groups | GET | teacher.exam_section_groups |
| /teacher/exam_section/<int:section_id>/groups | POST | teacher.add_exam_group |
| /teacher/exam_section/<int:section_id>/questions | GET | teacher.exam_section_questions |
| /teacher/exam_section/<int:section_id>/questions | POST | teacher.add_exam_question |
| /teacher/exam_section/<int:section_id>/toggle_active | POST | teacher.toggle_exam_section_active |
| /teacher/exam_section/<int:section_id>/update | POST | teacher.update_exam_section |
| /teacher/exam_subtract_time/<int:attempt_id>/<int:minutes> | POST | teacher.teacher_exam_subtract_time |
| /teacher/import_exam | GET, POST | teacher.import_exam |
| /teacher/pause_exam/<int:attempt_id> | POST | teacher.pause_exam |
| /teacher/promote_student/<int:student_id> | GET | teacher.promote_student |
| /teacher/results/<int:exam_id> | GET | teacher.teacher_results |
| /teacher/resume_exam/<int:attempt_id> | POST | teacher.resume_exam |
| /teacher/student/<int:student_id> | GET | teacher.student_profile |
| /teacher/student/<int:student_id>/exam/<int:exam_id> | GET | teacher.student_exam_detail |
| /teacher/technical_support | GET | teacher.teacher_technical_support |
| /teacher/toggle_exam/<int:exam_id> | GET | teacher.teacher_toggle_exam |

---

## Admin Dashboard & General Overview (admin_dashboard)

**Source File:** [cognitara/routes/admin/dashboard.py](file:///cognitara/routes/admin/dashboard.py)

| URL Pattern | Methods | Endpoint Handler |
| :--- | :--- | :--- |
| /admin | GET | admin_dashboard.admin_dashboard |
| /admin/delete_all_warning_logs | GET | admin_dashboard.delete_all_warning_logs |
| /admin/delete_student_warning_logs/<string:student_name> | GET | admin_dashboard.delete_student_warning_logs |
| /admin/delete_warning_log/<int:log_id> | GET | admin_dashboard.delete_warning_log |
| /admin/logs | GET | admin_dashboard.admin_logs |
| /admin/warning_logs | GET | admin_dashboard.warning_logs |

---

## Admin User Management (Students, Teachers, Admins) (admin_users)

**Source File:** [cognitara/routes/admin/users.py](file:///cognitara/routes/admin/users.py)

| URL Pattern | Methods | Endpoint Handler |
| :--- | :--- | :--- |
| /admin/add_student | GET, POST | admin_users.add_student |
| /admin/add_teacher | GET, POST | admin_users.add_teacher |
| /admin/approve_student/<int:student_id> | GET | admin_users.approve_student |
| /admin/delete_student/<int:student_id> | POST | admin_users.delete_student |
| /admin/delete_teacher/<int:teacher_id> | POST | admin_users.delete_teacher |
| /admin/edit_student/<int:student_id> | GET, POST | admin_users.edit_student |
| /admin/edit_teacher/<int:teacher_id> | GET, POST | admin_users.edit_teacher |
| /admin/pending_students | GET | admin_users.pending_students |
| /admin/reject_student/<int:student_id> | GET | admin_users.reject_student |
| /check_student_username | GET | admin_users.check_student_username |
| /check_teacher_username | GET | admin_users.check_teacher_username |

---

## Admin Technical Support & Audit Logging (admin_support)

**Source File:** [cognitara/routes/admin/support.py](file:///cognitara/routes/admin/support.py)

| URL Pattern | Methods | Endpoint Handler |
| :--- | :--- | :--- |
| /admin/exam_add_time/<int:attempt_id>/<int:minutes> | POST | admin_support.admin_exam_add_time |
| /admin/exam_force_submit/<int:attempt_id> | POST | admin_support.admin_exam_force_submit |
| /admin/exam_force_submit_all | POST | admin_support.admin_exam_force_submit_all |
| /admin/exam_live_data | GET | admin_support.admin_exam_live_data |
| /admin/exam_pause/<int:attempt_id> | POST | admin_support.admin_exam_pause |
| /admin/exam_pause_all | POST | admin_support.admin_exam_pause_all |
| /admin/exam_reset_warnings/<int:attempt_id> | POST | admin_support.admin_exam_reset_warnings |
| /admin/exam_resume/<int:attempt_id> | POST | admin_support.admin_exam_resume |
| /admin/exam_resume_all | POST | admin_support.admin_exam_resume_all |
| /admin/exam_subtract_time/<int:attempt_id>/<int:minutes> | POST | admin_support.admin_exam_subtract_time |
| /admin/exam_technical_support | GET | admin_support.admin_exam_technical_support |

---

## Admin Regular Exam Management & Section Builder (admin_exams)

**Source File:** [cognitara/routes/admin/exams.py](file:///cognitara/routes/admin/exams.py)

| URL Pattern | Methods | Endpoint Handler |
| :--- | :--- | :--- |
| /admin/add_exam | GET, POST | admin_exams.add_exam |
| /admin/add_question/<int:exam_id> | GET, POST | admin_exams.add_question |
| /admin/delete_exam/<int:exam_id> | POST | admin_exams.delete_exam |
| /admin/exam/<int:exam_id>/deactivate | POST | admin_exams.admin_deactivate_exam |
| /admin/exam/<int:exam_id>/delete | DELETE | admin_exams.admin_delete_exam_ajax |
| /admin/exam/<int:exam_id>/details | GET | admin_exams.admin_exam_details |
| /admin/exam/<int:exam_id>/export-json | GET | admin_exams.admin_export_exam_json |
| /admin/exam/<int:exam_id>/live-data | GET | admin_exams.admin_exam_live_monitoring |
| /admin/exam/<int:exam_id>/preview | GET | admin_exams.admin_exam_preview |
| /admin/exam/<int:exam_id>/reactivate | POST | admin_exams.admin_reactivate_exam |
| /admin/exam/<int:exam_id>/settings | POST | admin_exams.update_exam_settings |
| /admin/exam/<int:exam_id>/test-run | GET | admin_exams.admin_exam_test_run |
| /admin/exam/<int:exam_id>/toggle-status | POST | admin_exams.admin_toggle_exam_status |
| /admin/exam_attempts | GET | admin_exams.exam_attempts |
| /admin/exams-management | GET | admin_exams.admin_exams_management |
| /admin/exams/bulk-action | POST | admin_exams.admin_exams_bulk_action |
| /admin/reset_exam/<int:student_id>/<int:exam_id> | GET | admin_exams.reset_exam |
| /admin/toggle_exam/<int:exam_id> | GET | admin_exams.toggle_exam |
| /edit_exam/<int:exam_id> | GET, POST | admin_exams.edit_exam |

---

## Admin Results, Analytics & Grade Sheet Export (admin_results)

**Source File:** [cognitara/routes/admin/results.py](file:///cognitara/routes/admin/results.py)

| URL Pattern | Methods | Endpoint Handler |
| :--- | :--- | :--- |
| /admin/class/<class_name>/analytics | GET | admin_results.admin_class_analytics |
| /admin/results | GET | admin_results.view_results |
| /admin/school-analytics | GET | admin_results.admin_school_analytics |
| /admin/student/<int:student_id> | GET | admin_results.admin_student_profile |
| /admin/student/<int:student_id>/exam/<int:exam_id> | GET | admin_results.admin_student_exam_detail |

---

## Admin Common Entrance Comprehensive Management (admin_ce)

**Source File:** [cognitara/routes/admin/common_entrance.py](file:///cognitara/routes/admin/common_entrance.py)

| URL Pattern | Methods | Endpoint Handler |
| :--- | :--- | :--- |
| /admin/ce_active_exams | GET | admin_ce.admin_ce_active_exams |
| /admin/ce_add_time/<int:attempt_id>/<int:minutes> | POST | admin_ce.ce_add_time |
| /admin/ce_analytics/<int:exam_id> | GET | admin_ce.ce_analytics |
| /admin/ce_approve/<int:attempt_id> | POST | admin_ce.ce_approve |
| /admin/ce_approve_all_pending | POST | admin_ce.ce_approve_all_pending |
| /admin/ce_approve_resume/<int:attempt_id> | POST | admin_ce.admin_ce_approve_resume |
| /admin/ce_approve_resume_request/<int:attempt_id> | POST | admin_ce.ce_approve_resume_request |
| /admin/ce_delete_all_students | POST | admin_ce.admin_ce_delete_all_students |
| /admin/ce_delete_all_warnings | POST | admin_ce.ce_delete_all_warnings |
| /admin/ce_delete_student/<int:student_id> | POST | admin_ce.admin_ce_delete_student |
| /admin/ce_delete_student_warnings/<int:student_id>/<int:exam_id> | POST | admin_ce.ce_delete_student_warnings |
| /admin/ce_delete_warning_log/<int:log_id> | POST | admin_ce.ce_delete_warning_log |
| /admin/ce_exam/<int:exam_id> | POST | admin_ce.update_ce_exam |
| /admin/ce_exam/<int:exam_id>/delete | GET | admin_ce.delete_ce_exam |
| /admin/ce_exam/<int:exam_id>/sections | POST | admin_ce.add_ce_section |
| /admin/ce_exam/<int:exam_id>/settings | GET | admin_ce.ce_exam_settings_page |
| /admin/ce_exam/<int:exam_id>/toggle | GET | admin_ce.toggle_ce_exam_status |
| /admin/ce_exam/create | GET | admin_ce.create_ce_exam_page |
| /admin/ce_exam/create | POST | admin_ce.create_ce_exam_ajax |
| /admin/ce_exam/create | POST | admin_ce.create_ce_exam |
| /admin/ce_export/<int:exam_id>/csv | GET | admin_ce.ce_export_csv |
| /admin/ce_export/<int:exam_id>/excel | GET | admin_ce.ce_export_excel |
| /admin/ce_export_student/<int:student_id>/<int:exam_id>/csv | GET | admin_ce.ce_export_student_csv |
| /admin/ce_force_submit/<int:attempt_id> | POST | admin_ce.ce_force_submit |
| /admin/ce_force_submit_all | POST | admin_ce.ce_force_submit_all |
| /admin/ce_get_student_stats/<int:student_id>/<int:exam_id> | GET | admin_ce.ce_get_student_stats |
| /admin/ce_get_students_by_status | GET | admin_ce.ce_get_students_by_status |
| /admin/ce_group/<int:group_id>/add_question | POST | admin_ce.add_question_to_group |
| /admin/ce_group/<int:group_id>/delete | GET | admin_ce.delete_ce_group |
| /admin/ce_group/<int:group_id>/edit | GET, POST | admin_ce.edit_ce_group |
| /admin/ce_group_question/<int:question_id>/edit | GET, POST | admin_ce.edit_ce_group_question |
| /admin/ce_live_data | GET | admin_ce.ce_live_data |
| /admin/ce_pause_all_exams | POST | admin_ce.ce_pause_all_exams |
| /admin/ce_pause_exam/<int:attempt_id> | POST | admin_ce.admin_ce_pause_exam |
| /admin/ce_question/<int:question_id>/data | GET | admin_ce.ce_question_data |
| /admin/ce_question/<int:question_id>/delete | GET | admin_ce.delete_ce_question |
| /admin/ce_question/<int:question_id>/edit | GET, POST | admin_ce.edit_ce_question |
| /admin/ce_question/<int:question_id>/remove_from_group | GET | admin_ce.remove_question_from_group |
| /admin/ce_register_student | POST | admin_ce.admin_ce_register_student |
| /admin/ce_reject/<int:attempt_id> | POST | admin_ce.ce_reject |
| /admin/ce_reset_all_students_exams | POST | admin_ce.ce_reset_all_students_exams |
| /admin/ce_reset_student_exam/<int:student_id>/<int:exam_id> | POST | admin_ce.ce_reset_student_exam |
| /admin/ce_reset_warnings/<int:attempt_id> | POST | admin_ce.ce_reset_warnings |
| /admin/ce_resume_all_exams | POST | admin_ce.ce_resume_all_exams |
| /admin/ce_resume_exam/<int:attempt_id> | POST | admin_ce.admin_ce_resume_exam |
| /admin/ce_section/<int:section_id>/delete | POST | admin_ce.delete_ce_section |
| /admin/ce_section/<int:section_id>/groups | GET | admin_ce.ce_section_groups |
| /admin/ce_section/<int:section_id>/groups | POST | admin_ce.add_ce_group |
| /admin/ce_section/<int:section_id>/questions | GET | admin_ce.ce_section_questions |
| /admin/ce_section/<int:section_id>/questions | POST | admin_ce.add_ce_question |
| /admin/ce_section/<int:section_id>/toggle_active | POST | admin_ce.toggle_ce_section_active |
| /admin/ce_section/<int:section_id>/update | POST | admin_ce.update_ce_section |
| /admin/ce_student_analytics/<int:student_id>/<int:exam_id> | GET | admin_ce.ce_student_analytics |
| /admin/ce_student_approve/<int:student_id>/<int:exam_id> | POST | admin_ce.ce_student_approve |
| /admin/ce_student_reject/<int:student_id>/<int:exam_id> | POST | admin_ce.ce_student_reject |
| /admin/ce_student_review/<int:student_id>/<int:exam_id> | GET | admin_ce.ce_student_review |
| /admin/ce_subtract_time/<int:attempt_id>/<int:minutes> | POST | admin_ce.ce_subtract_time |
| /admin/ce_tech_pause/<int:attempt_id> | POST | admin_ce.ce_tech_pause |
| /admin/ce_tech_resume/<int:attempt_id> | POST | admin_ce.ce_tech_resume |
| /admin/ce_technical_support | GET | admin_ce.ce_technical_support |
| /admin/ce_technical_support_count | GET | admin_ce.ce_technical_support_count |
| /admin/common-entrance | GET | admin_ce.admin_common_entrance |
| /check_ce_username | GET | admin_ce.check_ce_username |

---

## Global Static & File Handlers (global)

**Source File:** [Flask Built-in](file:///Flask Built-in)

| URL Pattern | Methods | Endpoint Handler |
| :--- | :--- | :--- |
| /static/<path:filename> | GET | static |

---


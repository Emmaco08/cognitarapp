# CogniTara Offline Examination Portal - Server Operator Runbook
**Document Version:** 4.4.0  
**Target Audience:** System Administrators, IT Coordinators, and Examination Chief Proctors  
**Scope:** Offline Enterprise Deployment, Concurrency Management, Live Monitoring, Hot Backups, and Disaster Recovery

---

## Executive Overview

The **CogniTara Offline Examination Portal** is an enterprise-grade, server-authoritative examination platform designed for 100% offline deployment on isolated school local area networks (LANs). 

The platform is architected around four operational pillars:
1. **Server-Authoritative State:** Exam countdowns, active leases, warnings, and submissions are strictly enforced on the server. Client clocks cannot manipulate exam duration.
2. **Instant In-Place Answer Persistence:** Answers are sent immediately upon selection, committed to SQLite in Write-Ahead Logging (WAL) mode, and deduplicated in place.
3. **Cross-Computer Session Fencing:** Each active attempt is bound to a single cryptographic session lease (`session_key`). If an exam is resumed on a replacement machine, any previous station is instantly locked with a non-dismissible `Session Superseded` overlay.
4. **Hot Online Backups:** The database can be safely snapshotted during active examination without locking writers or interrupting student submissions via `sqlite3.Connection.backup()`.

---

## Table of Contents
1. [Domain 1: Pre-Exam Readiness Checklist & Hardware Specifications](#domain-1-pre-exam-readiness-checklist--hardware-specifications)
2. [Domain 2: LAN Network Configuration & IP Binding](#domain-2-lan-network-configuration--ip-binding)
3. [Domain 3: Pre-Flight Health Checks & Baseline Backup](#domain-3-pre-flight-health-checks--baseline-backup)
4. [Domain 4: Starting the Production WSGI Server](#domain-4-starting-the-production-wsgi-server)
5. [Domain 5: Real-Time Proctor Monitoring & Operational Diagnostics](#domain-5-real-time-proctor-monitoring--operational-diagnostics)
6. [Domain 6: Live Hot Backup Execution and Rotation](#domain-6-live-hot-backup-execution-and-rotation)
7. [Domain 7: Disaster Recovery & Database Restoration](#domain-7-disaster-recovery--database-restoration)
8. [Domain 8: Student Machine Failure & Cross-Computer Resume Procedure](#domain-8-student-machine-failure--cross-computer-resume-procedure)
9. [Domain 9: Post-Exam Graceful Shutdown & Final Archiving](#domain-9-post-exam-graceful-shutdown--final-archiving)

---

## Domain 1: Pre-Exam Readiness Checklist & Hardware Specifications

### 1.1 Server Hardware Specifications

| Component | Minimum Specification (Up to 50 Students) | Recommended Specification (50 to 150+ Students) |
| :--- | :--- | :--- |
| **CPU** | Quad-Core 2.5 GHz (Intel Core i5 / AMD Ryzen 5) | 8-Core 3.2+ GHz (Intel Core i7 / Xeon / Ryzen 7) |
| **RAM** | 8 GB DDR4 | 16 GB - 32 GB DDR4/DDR5 |
| **Storage** | 256 GB SATA SSD (min. 100 MB/s write) | 512 GB+ NVMe M.2 SSD (min. 1500 MB/s write) |
| **Network** | 100 Mbps Gigabit Ethernet NIC | 1 Gbps Full-Duplex Dedicated Ethernet NIC |
| **OS** | Windows 10/11 Pro (64-bit) or Windows Server | Windows 11 Pro / Windows Server 2019/2022 |
| **Power** | Dedicated Uninterruptible Power Supply (UPS) | Dual UPS with auto-generator changeover |

> [!IMPORTANT]
> The server MUST use Solid State Storage (NVMe or SATA SSD). Mechanical hard disk drives (HDDs) have high rotational latency and are not recommended for concurrent SQLite WAL write workloads.

### 1.2 Student Workstation Requirements
- **Hardware:** Any desktop or laptop with dual-core CPU, 2 GB RAM, 1024x768 minimum display resolution.
- **Web Browser:** Google Chrome, Microsoft Edge, Mozilla Firefox, or Chromium-based browsers (versions released within the last 3 years).
- **Network:** Wired Ethernet connection preferred; enterprise Wi-Fi (802.11ac/ax) with strong coverage is acceptable.
- **Settings:** JavaScript enabled; cookies enabled; pop-up blockers disabled for the server IP address.

### 1.3 Pre-Exam Verification Checklist (T-24 Hours to T-1 Hour)
- [ ] Server UPS fully charged and tested under simulated mains drop.
- [ ] Network switch and cables verified with zero packet loss.
- [ ] Exam questions, diagrams, and comprehension passages verified in the portal.
- [ ] Student accounts generated, approved, and class rosters assigned.
- [ ] Offline self-containment verified (zero external internet dependency).
- [ ] Static assets (fonts, icons, CSS, MathJax) loading properly offline.
- [ ] Database backup taken and verified prior to student admittance.

### 1.4 Wave-Staggering Operational Protocol (Cohorts > 25 Students)
- **Certified Operating Capacity:** 10 to 25 simultaneous students per host server instance.
- **Hard Technical Ceiling:** 30 simultaneous students per instance.
- **Large Cohort Protocol (50 to 200+ candidates):**
  1. **Sequential Wave Partitioning:** Partition total student roster into sequential waves of 20 to 25 candidates (e.g., Wave A: 09:00-10:00, Wave B: 10:30-11:30, Wave C: 12:00-13:00).
  2. **Inter-Wave Checkpoint & Backup:** Between waves, take an online backup and flush WAL:
     ```cmd
     python scripts/backup_exam_db.py checkpoint exam.db --mode TRUNCATE
     python scripts/backup_exam_db.py backup exam.db --target-dir backups_waves
     ```
  3. **Staggered Login Window:** To eliminate concurrent login spikes on the single-writer SQLite database, admit students to stations and have them log in over a 2-minute rolling window (3 to 5 students every 20 seconds).

---

## Domain 2: LAN Network Configuration & IP Binding

### 2.1 Network Topology
The examination hall network must operate on an isolated LAN or VLAN without conflicting DHCP servers:

```
                      +-----------------------------+
                      |   CogniTara Exam Server     |
                      |   IP: 192.168.1.100:5000    |
                      +--------------+--------------+
                                     | (Gigabit Cat6)
                      +--------------+--------------+
                      |  Managed Switch / Router    |
                      |  Subnet: 192.168.1.0/24     |
                      +---+----------+----------+---+
                          |          |          |
         +----------------+          |          +----------------+
         |                           |                           |
+--------+--------+         +--------+--------+         +--------+--------+
| Student PC #01  |         | Student PC #25  |         | Proctor Station |
| 192.168.1.101   |         | 192.168.1.125   |         | 192.168.1.50    |
+-----------------+         +-----------------+         +-----------------+
```

### 2.2 Setting a Static IP Address on the Host Server
On the Windows Server machine:
1. Open **PowerShell** as Administrator.
2. Identify your Ethernet adapter name:
   ```powershell
   Get-NetAdapter | Where-Object {$_.Status -eq "Up"}
   ```
3. Assign a static IP address (example: `192.168.1.100` with gateway `192.168.1.1`):
   ```powershell
   New-NetIPAddress -InterfaceAlias "Ethernet" -IPAddress 192.168.1.100 -PrefixLength 24 -DefaultGateway 192.168.1.1
   ```

### 2.3 Windows Firewall Configuration
Allow incoming TCP connections on Port 5000:
```powershell
netsh advfirewall firewall add rule name="CogniTara Exam Portal" dir=in action=allow protocol=TCP localport=5000
```

### 2.4 Verifying Reachability from Workstations
From any student workstation, open command prompt or browser:
```cmd
ping 192.168.1.100
curl http://192.168.1.100:5000/health
```
Expected response:
```json
{"status":"ok"}
```

---

## Domain 3: Pre-Flight Health Checks & Baseline Backup

Before opening the examination doors, run the pre-flight verification script.

### 3.1 Verify Database Integrity
Run the built-in backup and integrity verification tool:
```cmd
cd C:\COGNITARA EXAM PORTAL
python scripts/backup_exam_db.py verify exam.db
```
**Expected Output:**
```
[*] Checking integrity of: exam.db
[+] SQLite PRAGMA integrity_check passed: ok
[+] Checksum (SHA-256): 7415985AE65B42C744F29F2B463457B78CA989B4735156DE465DF3FB63F67643
```

### 3.2 Take Pre-Exam Golden Backup
Execute a baseline snapshot before students begin:
```cmd
python scripts/backup_exam_db.py backup exam.db --target-dir backups_phase4_4 --keep 20
```
This produces:
- `backups_phase4_4/exam_backup_YYYYMMDD_HHMMSS.db`
- `backups_phase4_4/exam_backup_YYYYMMDD_HHMMSS.json` (metadata manifest containing SHA-256 checksum and table row counts).

### 3.3 Verify Route Architecture & Clean Imports
```cmd
python scripts/validate_architecture.py
```
Ensure all 6 checks pass with 100% route baseline parity.

---

## Domain 4: Starting the Production WSGI Server

The portal uses **Waitress**, a production-grade, multi-threaded pure-Python WSGI server optimized for Windows environments.

### 4.1 Quick-Start via Batch Script
Double-click `start_production_server.bat` in the project root:
```cmd
C:\COGNITARA EXAM PORTAL\start_production_server.bat
```

### 4.2 Starting via Command Line with Custom Tuning
For custom concurrency tuning, launch directly with environment overrides:
```cmd
cd C:\COGNITARA EXAM PORTAL
set COGNITARA_HOST=0.0.0.0
set COGNITARA_PORT=5000
set COGNITARA_THREADS=24
set COGNITARA_CONN_LIMIT=300
set COGNITARA_CHANNEL_TIMEOUT=30
python wsgi.py
```

### 4.3 Waitress Production Server Configuration Reference
| Parameter | Default | Production Recommended | Description |
| :--- | :--- | :--- | :--- |
| `COGNITARA_HOST` | `0.0.0.0` | `0.0.0.0` | Binds to all network interfaces for LAN access. |
| `COGNITARA_PORT` | `5000` | `5000` | HTTP port accessible to student stations. |
| `COGNITARA_THREADS` | `24` | `24` to `32` | Thread pool for handling simultaneous student saves. |
| `COGNITARA_CONN_LIMIT` | `300` | `300` | Max simultaneous open TCP sockets. |
| `COGNITARA_CHANNEL_TIMEOUT` | `30` | `30` | Seconds to hold idle student keep-alive connections. |
| `COGNITARA_CLEANUP_INTERVAL`| `15` | `15` | Frequency (seconds) for harvesting expired channels. |
| `COGNITARA_RATELIMIT_IP` | `60 per minute` | `120 to 300 per minute` | Rate limit per client IP. Elevate in NAT environments. |
| `COGNITARA_RATELIMIT_ACCOUNT`| `30 per minute` | `60 per minute` | Per-account rate limit protecting against brute forcing. |

### 4.4 Rate Limiting in NAT and Proxy Examination Halls
If student workstations access the server through a shared NAT router, proxy, or gateway where all traffic originates from a single IP address:
1. **Elevate IP Rate Limit:** Set `set COGNITARA_RATELIMIT_IP=300 per minute` before launching `wsgi.py` so concurrent answer saves from 25 students are not throttled.
2. **Complete Disable on Air-Gapped Networks:** In 100% physically isolated LAN labs with zero external access, rate limiting can be disabled:
   ```cmd
   set RATELIMIT_ENABLED=False
   ```

### 4.5 Verifying the Server is Listening
In a separate console:
```cmd
netstat -ano | findstr 5000
```
Expected output shows `LISTENING` on `0.0.0.0:5000`.

---

## Domain 5: Real-Time Proctor Monitoring & Operational Diagnostics

### 5.1 Proctor Live Technical Support Console
Log in to the administrative portal as an Admin or Proctor and navigate to:
`http://<SERVER_IP>:5000/admin/exam_technical_support`

The console provides real-time visibility across all active attempts:
- **Active Students:** Displays each connected student, class, exam, and current question.
- **Heartbeat Status:** Last heartbeat timestamp. Students whose heartbeat has stopped for >25s are highlighted in amber/red.
- **Pause Reason:** Explicitly displays why an attempt was paused:
  - `"Connection lost / heartbeat timeout"`
  - `"Maximum warning limit reached"`
  - `"Paused by Administrator / Proctor"`
- **Warning Count:** Current warning count vs maximum permitted.
- **Action Buttons:** Single-click "Unlock / Resume Attempt" and "Force Submit".

### 5.2 Server Log Monitoring
Server events are logged to the console and rotating log file at `logs/cognitara.log`.
To monitor live activity in PowerShell:
```powershell
Get-Content -Path "logs\cognitara.log" -Wait -Tail 50
```
Key log markers to watch:
- `[INFO] Single answer saved:` Normal student interaction.
- `[WARN] Disconnect detected:` Heartbeat lapsed; auto-pause triggered.
- `[SECURITY] Session superseded:` Station change fencing triggered.
- `[RETRY] Database busy retry:` SQLite concurrency retry activated (automatic recovery).

---

## Domain 6: Live Hot Backup Execution and Rotation

### 6.1 Online Non-Blocking Backups
During an examination, operators can take hot backups at scheduled intervals (e.g., every 15 or 30 minutes).

Because SQLite Write-Ahead Logging (WAL) is active, running `sqlite3.Connection.backup(pages=100)`:
1. Does NOT block active student answer writes.
2. Captures all uncheckpointed WAL frames in progress.
3. Automatically runs an integrity check on the resulting backup file.
4. Generates a cryptographic SHA-256 verification manifest.

### 6.2 Running a Mid-Exam Hot Backup
Open a command prompt on the server:
```cmd
cd C:\COGNITARA EXAM PORTAL
python scripts/backup_exam_db.py backup exam.db --target-dir backups_live --keep 12
```

### 6.3 Scheduling Hourly Live Backups (Windows Task Scheduler)
To automate live backups every 30 minutes during a 3-hour exam:
```cmd
schtasks /create /tn "CogniTara_Exam_Live_Backup" /tr "python \"C:\COGNITARA EXAM PORTAL\scripts\backup_exam_db.py\" backup \"C:\COGNITARA EXAM PORTAL\exam.db\" --target-dir \"C:\COGNITARA EXAM PORTAL\backups_live\" --keep 10" /sc minute /mo 30 /ru SYSTEM
```

---

## Domain 7: Disaster Recovery & Database Restoration

### 7.1 Scenario 1: Abrupt Server Crash or Power Loss
If the server machine loses power or the python process is terminated abruptly:
1. Restore power to the host machine.
2. Restart the server:
   ```cmd
   start_production_server.bat
   ```
3. SQLite WAL recovery is **fully automatic**:
   - SQLite opens `exam.db`, inspects `exam.db-wal`, and replays all committed transactions.
   - All student answers acknowledged prior to the crash are completely preserved.
   - Any student whose heartbeat stopped while the server was down will show as `is_paused = 1`.
   - The remaining time for each student is frozen on the server based on their pre-crash state.
4. Students refresh their browser; their UI displays the paused exam overlay awaiting proctor release.

### 7.2 Scenario 2: Database File Corruption (Worst-Case Hardware Failure)
In the rare event of disk sector failure or accidental corruption of `exam.db`:

1. **Stop the server immediately** (`Ctrl+C` in WSGI console or `taskkill /F /IM python.exe`).
2. List available verified backups:
   ```cmd
   python scripts/backup_exam_db.py list --target-dir backups_phase4_4
   ```
3. Restore from the most recent verified backup:
   ```cmd
   python scripts/backup_exam_db.py restore backups_phase4_4/exam_backup_YYYYMMDD_HHMMSS.db --target exam.db --force
   ```
   *The utility automatically creates a `.bak` copy of the existing database, verifies the backup checksum against the manifest, atomically replaces `exam.db`, and runs `PRAGMA integrity_check`.*
4. Restart the server:
   ```cmd
   python wsgi.py
   ```

---

## Domain 8: Student Machine Failure & Cross-Computer Resume Procedure

When a student workstation experiences hardware failure, blue-screens, or loses power, follow this 4-step recovery protocol:

### Step 1: Student Moves to Spare Computer
Guide the student to a designated spare workstation in the examination hall.

### Step 2: Proctor Unlocks Attempt via Admin Portal
1. Open the Technical Support console: `http://<SERVER_IP>:5000/admin/exam_technical_support`
2. Locate the affected student's name or username.
3. Click **"Unlock / Resume Attempt"**.
4. The backend:
   - Sets `is_paused = 0`.
   - Generates a **new cryptographic session key** (`session_key = secrets.token_hex(16)`).
   - Recalculates the student's `authoritative_deadline` by adding the elapsed pause duration.
   - Invalidates the previous computer's lease.

### Step 3: Student Logs In on Replacement Computer
1. The student navigates to `http://<SERVER_IP>:5000/login`.
2. The student enters their username and password.
3. Upon clicking **"Resume Exam"**, the student is redirected to `/exam/<exam_id>` or `/ce_exam/<attempt_id>`.
4. The browser restores:
   - Exact previous answers (from `exam_question_responses`).
   - Exact question order and randomization seed.
   - Authoritative countdown clock (reflecting frozen remaining time).

### Step 4: Verification of Station Fencing on Old Machine
If the failed computer boots back up or is refreshed:
- Any incoming heartbeat or save attempt sends the old session key.
- The server responds with `HTTP 403 { "superseded": true }`.
- The old workstation immediately locks with a full-screen, non-dismissible **"Session Superseded by Another Station"** overlay.
- All input fields are disabled, preventing double submissions or conflicting answers.

---

## Domain 9: Post-Exam Graceful Shutdown & Final Archiving

Once all students have submitted their examinations:

### 9.1 Verify All Submissions in Administrative Portal
1. Navigate to `/admin/exam_technical_support` and `/admin/scores`.
2. Confirm that all active attempt statuses are `completed` or `submitted`.
3. If any absent student remained in progress, click "Force Submit".

### 9.2 Graceful Server Termination
1. In the Waitress console window, press `Ctrl+C`.
2. Wait 5 seconds for Waitress worker threads to drain pending requests and close cleanly.

### 9.3 Force SQLite WAL Checkpoint to Main Database
Run a checkpoint to fold all committed WAL journal frames cleanly into the primary `exam.db` database:
```cmd
python scripts/backup_exam_db.py checkpoint exam.db --mode TRUNCATE
```
Expected output:
```text
[+] Checkpoint TRUNCATE completed successfully (0/0 frames transferred)
```

### 9.4 Create Immutable Post-Exam Archive Backup
Execute a final, verified golden archive:
```cmd
python scripts/backup_exam_db.py backup exam.db --target-dir archives_post_exam --keep 100
```

### 9.5 Export Examination Results
Log into `/admin/reports` or use the CLI export to save:
- Student Scores Summary (`.csv` and `.xlsx`).
- Item Analysis & Question Performance (`.csv`).
- Violation & Warning Audit Trail (`.csv`).

Copy the `archives_post_exam/` directory and exported spreadsheets to an external encrypted USB drive for archival storage.

---
*End of Operator Runbook - CogniTara Offline Examination Portal*

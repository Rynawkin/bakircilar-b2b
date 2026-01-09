# Vade Takip Module Integration Brief (B2B Admin)

This brief is meant to be read in a new session before continuing work on
the vade module. It captures SSH steps, data sources, scope, constraints,
and the planned technical shape of the integration.

-----------------------------------------------------------------------------
1) Purpose
-----------------------------------------------------------------------------
- Move the existing "vade-main" functionality into the B2B admin panel.
- Keep all features and content, but make it more compact and reliable.
- Integrate with Mikro (read-only) to remove the manual Excel pipeline.
- Keep Excel import as a fallback.

-----------------------------------------------------------------------------
2) Scope / Non-goals
-----------------------------------------------------------------------------
- Access: everyone except CUSTOMER (ADMIN, HEAD_ADMIN, MANAGER, SALES_REP,
  DIVERSEY).
- Do not write to Mikro. All Mikro access must be read-only.
- No requirement to keep the old vade-main UI as-is; we re-build in B2B.
- "ACIKLAMA(NOT)" column is not needed.

-----------------------------------------------------------------------------
3) Project Layout (current)
-----------------------------------------------------------------------------
- Backend: backend/ (Express + Prisma)
- Frontend: frontend/ (Next.js)
- Prisma schema used for DB: backend/prisma/schema.prisma
  NOTE: backend/src/prisma/schema.prisma exists but is outdated.
- Cron: backend/src/index.ts uses backend/src/config/index.ts

-----------------------------------------------------------------------------
4) Access & Roles
-----------------------------------------------------------------------------
- Existing middleware:
  - requireStaff (HEAD_ADMIN, ADMIN, MANAGER, SALES_REP)
  - requireStaffOrDiversey (adds DIVERSEY)
- Vade module must be accessible to all except CUSTOMER.
  Use requireStaffOrDiversey or add a new requireNonCustomer guard.

-----------------------------------------------------------------------------
5) Data Sources
-----------------------------------------------------------------------------
5.1) Mikro (MSSQL)
- Mikro is only reachable from the DigitalOcean droplet.
- Local connection to 185.123.54.61:16022 timed out.
- Key tables:
  - CARI_HESAPLAR
  - CARI_HESAP_HAREKETLERI (cha_vade_tarihi, cha_meblag, cha_d_c)
  - ODEME_PLANLARI
- Candidate function: dbo.fn_CariRiskFoyu(...) (needs verification).
- DO NOT modify Mikro data.

5.2) Excel fallback
- File lives under Downloads with name starting "sisteme ... .xlsx".
  Filename contains Turkish characters; use tab completion when opening.
- Columns:
  1) Cari hesap kodu
  2) Cari hesap adi
  3) Sektor kodu
  4) Grup kodu
  5) Bolge kodu
  6) Vadesi gecen bakiye
  7) Vadesi gecen bakiye vadesi
  8) Valor
  9) Cari Odeme Vadesi
 10) Vadesi gecmemis bakiye
 11) TOPLAM BAKIYE
 12) Vadesi gecmemis bakiye vadesi
 13) Bakiyeye konu ilk evrak tarihi
 14) ACIKLAMA(NOT) -> not used

5.3) Supabase legacy data
- Existing vade-main data is stored in Supabase.
- We need a migration into B2B DB.
- Use service role key via env, do NOT store it in the repo.
- Tables used in vade-main:
  - customers
  - customer_balances
  - customer_notes
  - customer_classifications
  - user_customer_assignments
  - notifications
  - notification_preferences
  - payment_notes (legacy)

-----------------------------------------------------------------------------
6) SSH to DigitalOcean (Mikro access)
-----------------------------------------------------------------------------
Host: 104.248.38.69

Keys available on this machine:
- ~/.ssh/claude_digitalocean
- ~/.ssh/id_ed25519

Try these users in order:
1) root
2) ubuntu
3) any custom user provided by DO

PowerShell examples:
- ssh -i $env:USERPROFILE\\.ssh\\claude_digitalocean -o IdentitiesOnly=yes root@104.248.38.69
- ssh -i $env:USERPROFILE\\.ssh\\id_ed25519 -o IdentitiesOnly=yes ubuntu@104.248.38.69

If permission denied:
- Verify correct username for the droplet.
- Verify public key is in ~/.ssh/authorized_keys on the server.
- Use `ssh -vvv` to debug.
- Confirm firewall allows port 22.

Optional SSH config (~/.ssh/config):
Host bkrc-do
  HostName 104.248.38.69
  User root
  IdentityFile ~/.ssh/claude_digitalocean
  IdentitiesOnly yes

Then: ssh bkrc-do

-----------------------------------------------------------------------------
7) B2B Current Behavior Relevant to Vade
-----------------------------------------------------------------------------
- Customers already exist as Users (User.mikroCariCode).
- Mikro cari sync: backend/src/services/cariSync.service.ts
- Notifications: backend/src/services/notification.service.ts
- Notification table: backend/prisma/schema.prisma -> Notification
- Cron: ENABLE_CRON, schedule in backend/src/index.ts
- Mikro config is in backend/.env (do not copy secrets to brief)

-----------------------------------------------------------------------------
8) vade-main Features Inventory (to port + improve)
-----------------------------------------------------------------------------
- Dashboard: totals and trends.
- Payment list: filters, quick note, export.
- Customer list with advanced search.
- Customer detail: balances, classification, notes, timeline, reminders.
- Calendar: reminders.
- Notes report + sector report.
- Management reports (user performance/activity).
- User assignments (assign customers to staff).
- Notifications/preferences (existing implementation is broken; use B2B panel
  notifications instead).

-----------------------------------------------------------------------------
9) Proposed Data Model in B2B
-----------------------------------------------------------------------------
Use existing User as "customer" (via mikroCariCode).

New models (names can be adjusted):
- VadeBalance
  - userId
  - mikroCariCode (indexed for lookups)
  - pastDueBalance
  - pastDueDate (oldest overdue)
  - notDueBalance
  - notDueDate (nearest upcoming)
  - totalBalance
  - valor (integer days)
  - paymentTermLabel (optional, from Excel or Mikro plan)
  - referenceDate (first invoice date)
  - source ("MIKRO" | "EXCEL")
  - updatedAt

- VadeNote
  - userId (customer)
  - authorId (staff)
  - noteContent
  - promiseDate
  - tags (Json)
  - reminderDate
  - reminderNote
  - reminderCompleted
  - balanceAtTime
  - createdAt / updatedAt

- VadeClassification
  - userId (customer)
  - classification
  - customClassification
  - riskScore (0-100)
  - createdById / updatedById
  - createdAt / updatedAt

- VadeAssignment
  - staffId
  - customerId
  - assignedById
  - createdAt

- VadeSyncLog
  - source ("MIKRO" | "EXCEL" | "MANUAL")
  - status
  - startedAt / completedAt
  - rowsUpdated
  - errorMessage

Index by userId, mikroCariCode, and reminderDate.

-----------------------------------------------------------------------------
10) Sync Logic (hourly)
-----------------------------------------------------------------------------
- New cron schedule: hourly (default "0 * * * *").
- For each B2B customer with mikroCariCode:
  - Pull Mikro balances and due dates.
  - Compute:
    - pastDueBalance: sum overdue amounts
    - pastDueDate: earliest overdue due date
    - notDueBalance: sum not-yet-due amounts
    - notDueDate: nearest future due date
    - totalBalance: past + not due (or Mikro balance if more reliable)
    - valor: per user definition:
      invoice age 90 days, payment term 60 -> valor 30
    - referenceDate: earliest invoice date in balance
  - Update records only if B2B values differ (user request).
- NOTE: we must validate the calculation against Mikro for 4-5 caris from Excel.

-----------------------------------------------------------------------------
11) Excel Fallback Import
-----------------------------------------------------------------------------
Map Excel fields to B2B:
- Cari hesap kodu -> User.mikroCariCode
- Cari hesap adi -> User.mikroName or displayName (optional)
- Sektor kodu -> User.sectorCode
- Grup kodu -> User.groupCode
- Bolge kodu -> optional (not critical)
- Cari Odeme Vadesi -> User.paymentPlanName or VadeBalance.paymentTermLabel
- Vadesi gecen bakiye -> VadeBalance.pastDueBalance
- Vadesi gecen bakiye vadesi -> VadeBalance.pastDueDate
- Vadesi gecmemis bakiye -> VadeBalance.notDueBalance
- Vadesi gecmemis bakiye vadesi -> VadeBalance.notDueDate
- Valor -> VadeBalance.valor
- TOPLAM BAKIYE -> VadeBalance.totalBalance
- Bakiyeye konu ilk evrak tarihi -> VadeBalance.referenceDate
- ACIKLAMA(NOT) -> ignore

Date parsing must handle Excel numeric dates and TR string dates.

-----------------------------------------------------------------------------
12) Notifications
-----------------------------------------------------------------------------
- Use B2B Notification model for panel-only alerts.
- Create notifications for:
  - note reminders (when reminderDate is due)
  - upcoming due window (default 7 days, configurable)
- No email or external push.

-----------------------------------------------------------------------------
13) Supabase Migration
-----------------------------------------------------------------------------
Add a backend script (backend/scripts/) using @supabase/supabase-js:
Mapping:
- customers.code -> User.mikroCariCode
- customer_balances -> VadeBalance
- customer_notes -> VadeNote (map user_id to staff via email if possible)
- customer_classifications -> VadeClassification
- user_customer_assignments -> VadeAssignment
- notifications -> optional into B2B Notification

Env vars (do NOT commit):
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY

-----------------------------------------------------------------------------
14) UI Integration (Next.js admin)
-----------------------------------------------------------------------------
Add nav item: "Vade Takip"

Proposed routes:
- /vade (overview dashboard)
- /vade/list (payment list)
- /vade/customers (customer list)
- /vade/customers/[id] (detail)
- /vade/calendar
- /vade/reports
- /vade/assignments
- /vade/import (Excel)

-----------------------------------------------------------------------------
15) Validation Checklist
-----------------------------------------------------------------------------
- Pick 4-5 sample caris from Excel; compare:
  - pastDueBalance, pastDueDate
  - notDueBalance, notDueDate
  - valor
  - payment term
- Confirm hourly sync updates all records that differ, not only those with
  "price change date".
- Verify access control for all non-CUSTOMER roles.

-----------------------------------------------------------------------------
16) Current Status / Blockers
-----------------------------------------------------------------------------
- Local Mikro connection timed out; need DO SSH.
- SSH attempts with root/ubuntu + ~/.ssh/claude_digitalocean failed.
  Need correct username or key to connect to 104.248.38.69.
- Parked issue (not in scope): B2B-created quote -> Mikro order crashes.

-----------------------------------------------------------------------------
17) Resume Instructions for New Session
-----------------------------------------------------------------------------
- Read this file first.
- Confirm DO SSH credentials and connect.
- Validate Mikro query for vade data on 4-5 caris.
- Then proceed with schema + backend + frontend changes.


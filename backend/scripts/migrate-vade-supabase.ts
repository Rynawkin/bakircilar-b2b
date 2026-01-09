import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient, VadeBalanceSource } from '@prisma/client';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey);
const prisma = new PrismaClient();

const PAGE_SIZE = 1000;

const fetchAll = async (table: string, select: string = '*') => {
  const rows: any[] = [];
  let from = 0;
  let to = PAGE_SIZE - 1;
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, to);
    if (error) {
      throw error;
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    to += PAGE_SIZE;
  }
  return rows;
};

const toDate = (value?: string | null) => {
  if (!value) return null;
  if (value === 'infinity' || value === '-infinity') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  if (year < 1900 || year > 2100) return null;
  return date;
};

const toNumber = (value?: number | string | null) => {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dryRun = process.argv.includes('--dry-run');

const run = async () => {
  console.log('Loading Supabase data...');
  const [supabaseCustomers, supabaseBalances, supabaseNotes, supabaseClassifications, supabaseAssignments, supabaseProfiles] =
    await Promise.all([
      fetchAll('customers'),
      fetchAll('customer_balances'),
      fetchAll('customer_notes'),
      fetchAll('customer_classifications'),
      fetchAll('user_customer_assignments'),
      fetchAll('profiles'),
    ]);

  const b2bUsers = await prisma.user.findMany({
    where: { mikroCariCode: { not: null } },
    select: { id: true, mikroCariCode: true, email: true },
  });

  const userByCode = new Map(
    b2bUsers
      .filter((user) => user.mikroCariCode)
      .map((user) => [user.mikroCariCode as string, user])
  );
  const userByEmail = new Map(
    b2bUsers
      .filter((user) => user.email)
      .map((user) => [user.email as string, user])
  );

  const supabaseCustomerById = new Map(
    supabaseCustomers.map((customer: any) => [customer.id, customer])
  );

  const profileById = new Map(
    supabaseProfiles.map((profile: any) => [profile.id, profile])
  );

  const existingNotes = await prisma.vadeNote.findMany({
    select: { customerId: true, noteContent: true, createdAt: true },
  });
  const existingNoteKeys = new Set(
    existingNotes.map((note) => `${note.customerId}|${note.noteContent}|${note.createdAt.toISOString()}`)
  );

  let balancesImported = 0;
  let balancesSkipped = 0;
  console.log('Migrating balances...');
  for (const balance of supabaseBalances) {
    const customer = supabaseCustomerById.get(balance.customer_id);
    if (!customer) {
      balancesSkipped += 1;
      continue;
    }
    const user = userByCode.get(String(customer.code || '').trim());
    if (!user) {
      balancesSkipped += 1;
      continue;
    }
    if (dryRun) {
      balancesImported += 1;
      continue;
    }
    await prisma.vadeBalance.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        pastDueBalance: toNumber(balance.past_due_balance),
        pastDueDate: toDate(balance.past_due_date),
        notDueBalance: toNumber(balance.not_due_balance),
        notDueDate: toDate(balance.not_due_date),
        totalBalance: toNumber(balance.total_balance),
        valor: toNumber(balance.valor),
        paymentTermLabel: customer.payment_term || null,
        referenceDate: toDate(balance.reference_date),
        source: VadeBalanceSource.EXCEL,
        createdAt: toDate(balance.created_at) || undefined,
        updatedAt: toDate(balance.updated_at) || undefined,
      },
      update: {
        pastDueBalance: toNumber(balance.past_due_balance),
        pastDueDate: toDate(balance.past_due_date),
        notDueBalance: toNumber(balance.not_due_balance),
        notDueDate: toDate(balance.not_due_date),
        totalBalance: toNumber(balance.total_balance),
        valor: toNumber(balance.valor),
        paymentTermLabel: customer.payment_term || null,
        referenceDate: toDate(balance.reference_date),
        source: VadeBalanceSource.EXCEL,
        updatedAt: toDate(balance.updated_at) || undefined,
      },
    });
    balancesImported += 1;
  }

  console.log('Migrating classifications...');
  let classificationsImported = 0;
  let classificationsSkipped = 0;
  for (const item of supabaseClassifications) {
    const customer = supabaseCustomerById.get(item.customer_id);
    if (!customer) {
      classificationsSkipped += 1;
      continue;
    }
    const user = userByCode.get(String(customer.code || '').trim());
    if (!user) {
      classificationsSkipped += 1;
      continue;
    }
    if (dryRun) {
      classificationsImported += 1;
      continue;
    }
    await prisma.vadeClassification.upsert({
      where: { customerId: user.id },
      create: {
        customerId: user.id,
        classification: item.classification,
        customClassification: item.custom_classification,
        riskScore: item.risk_score,
        createdAt: toDate(item.created_at) || undefined,
        updatedAt: toDate(item.updated_at) || undefined,
      },
      update: {
        classification: item.classification,
        customClassification: item.custom_classification,
        riskScore: item.risk_score,
        updatedAt: toDate(item.updated_at) || undefined,
      },
    });
    classificationsImported += 1;
  }

  console.log('Migrating notes...');
  let notesImported = 0;
  let notesSkipped = 0;
  for (const note of supabaseNotes) {
    const customer = supabaseCustomerById.get(note.customer_id);
    if (!customer) {
      notesSkipped += 1;
      continue;
    }
    const user = userByCode.get(String(customer.code || '').trim());
    if (!user) {
      notesSkipped += 1;
      continue;
    }
    const profile = profileById.get(note.user_id);
    const authorEmail = profile?.email || profile?.user_email || null;
    const author = authorEmail ? userByEmail.get(authorEmail) : null;

    const createdAt = toDate(note.created_at);
    const createdAtKey = createdAt ? createdAt.toISOString() : '';
    const noteKey = `${user.id}|${note.note_content}|${createdAtKey}`;

    if (existingNoteKeys.has(noteKey)) {
      notesSkipped += 1;
      continue;
    }

    if (dryRun) {
      notesImported += 1;
      continue;
    }
    const noteTags = Array.isArray(note.tags) ? note.tags : [];
    await prisma.vadeNote.create({
      data: {
        customerId: user.id,
        authorId: author?.id || null,
        noteContent: note.note_content,
        promiseDate: toDate(note.promise_date),
        tags: noteTags,
        reminderDate: toDate(note.reminder_date),
        reminderNote: note.reminder_note,
        reminderCompleted: note.reminder_completed || false,
        balanceAtTime: note.balance_at_time,
        createdAt: createdAt || undefined,
        updatedAt: toDate(note.updated_at) || undefined,
      },
    });
    existingNoteKeys.add(noteKey);
    notesImported += 1;
  }

  console.log('Migrating assignments...');
  let assignmentsImported = 0;
  let assignmentsSkipped = 0;
  for (const assignment of supabaseAssignments) {
    const customer = supabaseCustomerById.get(assignment.customer_id);
    if (!customer) {
      assignmentsSkipped += 1;
      continue;
    }
    const customerUser = userByCode.get(String(customer.code || '').trim());
    if (!customerUser) {
      assignmentsSkipped += 1;
      continue;
    }
    const profile = profileById.get(assignment.user_id);
    const staffEmail = profile?.email || profile?.user_email || null;
    const staffUser = staffEmail ? userByEmail.get(staffEmail) : null;
    if (!staffUser) {
      assignmentsSkipped += 1;
      continue;
    }
    if (dryRun) {
      assignmentsImported += 1;
      continue;
    }
    await prisma.vadeAssignment.createMany({
      data: [
        {
          staffId: staffUser.id,
          customerId: customerUser.id,
          createdAt: toDate(assignment.created_at) || undefined,
          updatedAt: toDate(assignment.updated_at) || undefined,
        },
      ],
      skipDuplicates: true,
    });
    assignmentsImported += 1;
  }

  console.log('Migration summary:');
  console.log(`Balances imported: ${balancesImported}, skipped: ${balancesSkipped}`);
  console.log(`Classifications imported: ${classificationsImported}, skipped: ${classificationsSkipped}`);
  console.log(`Notes imported: ${notesImported}, skipped: ${notesSkipped}`);
  console.log(`Assignments imported: ${assignmentsImported}, skipped: ${assignmentsSkipped}`);

  await prisma.$disconnect();
};

run().catch(async (error) => {
  console.error('Migration failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});

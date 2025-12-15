import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createHeadAdmin() {
  try {
    console.log('Creating HEAD_ADMIN user...');

    const email = 'ensarucarer@bakircilargrup.com';
    const password = '258963147En*';
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email }
    });

    if (existing) {
      console.log('HEAD_ADMIN user already exists, updating role...');
      await prisma.user.update({
        where: { email },
        data: {
          role: UserRole.HEAD_ADMIN,
          password: hashedPassword,
          name: 'Ensar Uçarer',
          displayName: 'Ensar Uçarer',
          active: true
        }
      });
      console.log('✓ HEAD_ADMIN user updated successfully');
    } else {
      console.log('Creating new HEAD_ADMIN user...');
      await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name: 'Ensar Uçarer',
          displayName: 'Ensar Uçarer',
          mikroName: 'Ensar Uçarer',
          role: UserRole.HEAD_ADMIN,
          active: true
        }
      });
      console.log('✓ HEAD_ADMIN user created successfully');
    }

    console.log('\nHEAD_ADMIN Credentials:');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('Role: HEAD_ADMIN');

  } catch (error) {
    console.error('Error creating HEAD_ADMIN user:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createHeadAdmin();

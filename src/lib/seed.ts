import { db } from './db';
import { hashPassword } from './auth';

async function seed() {
  console.log('🌱 Seeding database...\n');

  // Check if founder admin already exists
  const existingAdmin = await db.user.findUnique({
    where: { email: 'founder@digiactiva.com' },
  });

  if (existingAdmin) {
    console.log('⚠️  Founder admin already exists, skipping seed.');
    return;
  }

  // Hash password
  const passwordHash = await hashPassword('digiactiva2025');

  // Create founder admin, demo workspace, and membership
  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: 'founder@digiactiva.com',
        passwordHash,
        name: 'Founder Admin',
        role: 'founder_admin',
      },
    });

    const workspace = await tx.workspace.create({
      data: {
        name: 'DigiActiva Demo',
        slug: 'demo',
        plan: 'founder_full',
        modules: JSON.stringify({
          chat: true,
          whatsapp: true,
          crm: true,
          inbox: true,
          voice: true,
          copilot: true,
        }),
        branding: JSON.stringify({
          color: '#10b981',
          nombre_negocio: 'DigiActiva',
        }),
      },
    });

    await tx.workspaceMember.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        role: 'admin',
      },
    });

    // Update user with active workspace
    const updatedUser = await tx.user.update({
      where: { id: user.id },
      data: {
        activeWorkspaceId: workspace.id,
        workspaceIds: JSON.stringify([workspace.id]),
      },
    });

    return { user: updatedUser, workspace };
  });

  console.log('✅ Founder admin created:');
  console.log(`   Email:    ${result.user.email}`);
  console.log(`   Password: digiactiva2025`);
  console.log(`   Role:     ${result.user.role}`);
  console.log();
  console.log('✅ Demo workspace created:');
  console.log(`   Name:     ${result.workspace.name}`);
  console.log(`   Slug:     ${result.workspace.slug}`);
  console.log(`   Plan:     ${result.workspace.plan}`);
  console.log('\n🌱 Seed completed successfully!');
}

seed()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

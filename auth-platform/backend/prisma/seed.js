import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const password = await bcrypt.hash('demo123', 12);

  const alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      email: 'alice@example.com',
      passwordHash: password,
      totpSecret: authenticator.generateSecret(),
      totpEnabled: false
    }
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      email: 'bob@example.com',
      passwordHash: password,
      totpEnabled: false
    }
  });

  const charlie = await prisma.user.upsert({
    where: { email: 'charlie@example.com' },
    update: {},
    create: {
      email: 'charlie@example.com',
      passwordHash: password,
      totpEnabled: false
    }
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      passwordHash: password,
      totpEnabled: false
    }
  });

  console.log('Created users:', { alice: alice.id, bob: bob.id, charlie: charlie.id, admin: admin.id });

  const deployPolicy = await prisma.approvalPolicy.upsert({
    where: { name: 'production-deploy' },
    update: {},
    create: {
      name: 'production-deploy',
      description: 'Approval required for production deployments',
      actionType: 'deploy_production',
      requiredWeight: 2,
      timeoutMinutes: 120,
      escalationChain: JSON.stringify([admin.id])
    }
  });

  const transactionPolicy = await prisma.approvalPolicy.upsert({
    where: { name: 'high-value-transaction' },
    update: {},
    create: {
      name: 'high-value-transaction',
      description: 'Approval required for transactions over $10,000',
      actionType: 'approve_transaction',
      requiredWeight: 3,
      timeoutMinutes: 60,
      escalationChain: JSON.stringify([admin.id])
    }
  });

  const deletePolicy = await prisma.approvalPolicy.upsert({
    where: { name: 'data-deletion' },
    update: {},
    create: {
      name: 'data-deletion',
      description: 'Approval required for data deletion',
      actionType: 'delete_data',
      requiredWeight: 2,
      timeoutMinutes: 30
    }
  });

  console.log('Created policies:', {
    deploy: deployPolicy.id,
    transaction: transactionPolicy.id,
    delete: deletePolicy.id
  });

  const approverRoles = [
    { userId: bob.id, policyId: deployPolicy.id, weight: 1, priority: 1 },
    { userId: charlie.id, policyId: deployPolicy.id, weight: 1, priority: 1 },
    { userId: admin.id, policyId: deployPolicy.id, weight: 2, priority: 0 },
    { userId: bob.id, policyId: transactionPolicy.id, weight: 1, priority: 1 },
    { userId: charlie.id, policyId: transactionPolicy.id, weight: 1, priority: 1 },
    { userId: admin.id, policyId: transactionPolicy.id, weight: 3, priority: 0 },
    { userId: charlie.id, policyId: deletePolicy.id, weight: 1, priority: 1 },
    { userId: admin.id, policyId: deletePolicy.id, weight: 2, priority: 0 }
  ];

  for (const role of approverRoles) {
    await prisma.approverRole.upsert({
      where: { userId_policyId: { userId: role.userId, policyId: role.policyId } },
      update: {},
      create: role
    });
  }

  console.log('Created approver roles');

  for (const provider of ['sms', 'push', 'email']) {
    await prisma.failoverStatus.upsert({
      where: { provider },
      update: { isHealthy: true, lastCheck: new Date() },
      create: { provider, isHealthy: true, lastCheck: new Date() }
    });
  }

  console.log('Initialized failover status');

  console.log('\n=== Demo Credentials ===');
  console.log('All users password: demo123');
  console.log('Users: alice@example.com, bob@example.com, charlie@example.com, admin@example.com');
  console.log('\n=== Approval Policies ===');
  console.log('- production-deploy: Requires weight 2 (Bob+Charlie or Admin alone)');
  console.log('- high-value-transaction: Requires weight 3 (Admin alone or Bob+Charlie+someone)');
  console.log('- data-deletion: Requires weight 2 (Charlie+Admin or Admin alone)');
  console.log('\nSeeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'hackathon-dev-secret';
const ADMIN_TOKEN_EXPIRY = '8h';

export class AdminAuthService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async createAdmin(email, password, name = null) {
    const existing = await this.prisma.admin.findUnique({ where: { email } });
    if (existing) {
      throw new Error('Admin already exists');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await this.prisma.admin.create({
      data: {
        email,
        passwordHash,
        name
      }
    });

    return { id: admin.id, email: admin.email, name: admin.name };
  }

  async login(email, password) {
    const admin = await this.prisma.admin.findUnique({ where: { email } });

    if (!admin) {
      throw new Error('Invalid credentials');
    }

    if (!admin.isActive) {
      throw new Error('Account is deactivated');
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      throw new Error('Invalid credentials');
    }

    await this.prisma.admin.update({
      where: { id: admin.id },
      data: { lastLogin: new Date() }
    });

    const token = jwt.sign(
      {
        sub: admin.id,
        email: admin.email,
        type: 'admin',
        permissions: admin.permissions
      },
      JWT_SECRET,
      { expiresIn: ADMIN_TOKEN_EXPIRY }
    );

    return {
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        permissions: admin.permissions
      }
    };
  }

  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.type !== 'admin') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch (err) {
      throw new Error('Invalid or expired admin token');
    }
  }

  async getAdmin(adminId) {
    return this.prisma.admin.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        email: true,
        name: true,
        permissions: true,
        isActive: true,
        lastLogin: true,
        createdAt: true
      }
    });
  }

  async listAdmins() {
    return this.prisma.admin.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        permissions: true,
        isActive: true,
        lastLogin: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async updateAdmin(adminId, data) {
    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.permissions !== undefined) updateData.permissions = data.permissions;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 12);
    }

    return this.prisma.admin.update({
      where: { id: adminId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        permissions: true,
        isActive: true
      }
    });
  }

  async seedDefaultAdmin() {
    const existing = await this.prisma.admin.findFirst();
    if (existing) {
      return { seeded: false, message: 'Admin already exists' };
    }

    const admin = await this.createAdmin('admin@authplatform.com', 'admin123', 'System Admin');
    return { seeded: true, admin };
  }
}

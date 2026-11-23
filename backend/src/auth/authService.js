import argon2 from 'argon2';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../config/db.js';
import {
  PUBLIC_BUSINESS_TYPES,
  mapBusinessTypeToPortal,
  WORKER_DEFAULT_PERMISSIONS
} from '../config/permissions.js';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function hashPassword(plainPassword) {
  return argon2.hash(plainPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1
  });
}

export async function verifyPassword(hash, plainPassword) {
  if (!hash) return false;
  return argon2.verify(hash, plainPassword);
}

export function generateSessionToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function generateInviteCode() {
  const raw = 'SHK-' + crypto.randomBytes(5).toString('hex').toUpperCase();
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function setSessionCookie(res, rawToken) {
  res.cookie('sahayak_session', rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: Number(process.env.SESSION_TTL_HOURS || 24) * 3600 * 1000
  });
}

export async function createSession(userId, req = null) {
  const { raw, hash } = generateSessionToken();
  await prisma.userSession.create({
    data: {
      userId,
      tokenHash: hash,
      ipAddress: req?.ip || req?.socket?.remoteAddress || null,
      userAgent: req?.headers?.['user-agent']?.slice(0, 255) || null,
      expiresAt: new Date(Date.now() + Number(process.env.SESSION_TTL_HOURS || 24) * 3600 * 1000)
    }
  });
  return raw;
}

export async function recordLoginAttempt({ userId = null, email, success, method = 'PASSWORD', req = null, failureReason = null }) {
  try {
    await prisma.loginHistory.create({
      data: {
        userId,
        email: String(email || '').toLowerCase().trim(),
        success,
        method,
        ipAddress: req?.ip || req?.socket?.remoteAddress || null,
        userAgent: req?.headers?.['user-agent']?.slice(0, 255) || null,
        failureReason
      }
    });
  } catch (err) {
    console.error('[LoginHistory Error]', err.message);
  }
}

export function sanitizeUser(user, membership = null) {
  const activeMembership = membership || user.memberships?.[0] || null;
  const org = activeMembership?.organization || null;

  return {
    id: user.id,
    email: user.email,
    phone: user.phone || null,
    fullName: user.fullName,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    phoneVerified: Boolean(user.phoneVerified),
    mfaEnabled: Boolean(user.mfaEnabled),
    businessProfile: user.businessProfile
      ? {
          id: user.businessProfile.id,
          businessName: user.businessProfile.businessName,
          businessType: user.businessProfile.businessType || user.role,
          category: user.businessProfile.category,
          description: user.businessProfile.description,
          city: user.businessProfile.city,
          district: user.businessProfile.district,
          state: user.businessProfile.state,
          pinCode: user.businessProfile.pinCode,
          gstin: user.businessProfile.gstin,
          pan: user.businessProfile.pan,
          gstVerified: user.businessProfile.gstVerified,
          operatingRegions: user.businessProfile.operatingRegions,
          verification: user.businessProfile.verification
            ? {
                status: user.businessProfile.verification.status,
                reviewerNotes: user.businessProfile.verification.reviewerNotes || null,
                reviewedAt: user.businessProfile.verification.reviewedAt || null,
                documentsCount: user.businessProfile.verification._count?.documents ?? 0,
                history: Array.isArray(user.businessProfile.verification.history)
                  ? user.businessProfile.verification.history
                  : []
              }
            : null
        }
      : null,
    organization: org
      ? {
          id: org.id,
          name: org.name,
          portalType: org.portalType,
          businessType: org.businessType,
          category: org.category,
          description: org.description,
          city: org.city,
          district: org.district,
          state: org.state,
          pinCode: org.pinCode,
          gstin: org.gstin,
          gstVerified: org.gstVerified,
          identityVerified: org.identityVerified,
          documentsVerified: org.documentsVerified,
          verificationStatus: org.verificationStatus,
          operatingRegions: org.operatingRegions
        }
      : null,
    membership: activeMembership
      ? {
          id: activeMembership.id,
          organizationId: activeMembership.organizationId,
          isOwner: activeMembership.isOwner,
          workerRole: activeMembership.workerRole,
          employeeId: activeMembership.employeeId,
          department: activeMembership.department,
          designation: activeMembership.designation,
          branchId: activeMembership.branchId,
          branchName: activeMembership.branch?.name || null,
          employmentStatus: activeMembership.employmentStatus,
          permissions: activeMembership.isOwner
            ? ['*']
            : Array.from(new Set([
                ...(WORKER_DEFAULT_PERMISSIONS[activeMembership.workerRole] || []),
                ...(Array.isArray(activeMembership.permissions) ? activeMembership.permissions : [])
              ]))
        }
      : null
  };
}

/**
 * Registers a new business account (Buyer, Seller [Wholesaler/Manufacturer/Distributor/Supplier], or Logistics).
 * Strictly blocks WORKER and any ADMIN role from public business registration.
 * Creates User + Organization + HQ Branch + Owner Membership + BusinessProfile + BusinessVerification + EmailVerificationToken atomically.
 */
export async function registerBusinessAccount(payload) {
  const businessType = String(payload.businessType || payload.role || '').toUpperCase();
  if (!PUBLIC_BUSINESS_TYPES.has(businessType)) {
    throw new Error('Selected business type is not eligible for public business registration.');
  }

  const portalType = mapBusinessTypeToPortal(businessType);
  const email = payload.email.toLowerCase().trim();
  const phone = payload.phone ? payload.phone.trim() : null;
  const gstin = payload.gstin ? payload.gstin.trim().toUpperCase() : null;

  // Conditional document/regulatory validation: GSTIN required for Wholesalers, Manufacturers, Distributors
  if (['WHOLESALER', 'MANUFACTURER', 'DISTRIBUTOR'].includes(businessType) && !gstin) {
    throw new Error(`GSTIN is required for ${businessType.toLowerCase()} accounts.`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error('Unable to register with this email address. Try signing in or resetting your password.');
  }
  if (phone) {
    const existingPhone = await prisma.user.findUnique({ where: { phone } });
    if (existingPhone) {
      throw new Error('This phone number is already associated with an account.');
    }
  }
  if (gstin) {
    const existingGstin = await prisma.organization.findUnique({ where: { gstin } });
    if (existingGstin) {
      throw new Error('An organization with this GSTIN is already registered.');
    }
  }

  const passwordHash = await hashPassword(payload.password);
  const emailVerifyRaw = crypto.randomBytes(32).toString('hex');
  const emailVerifyHash = crypto.createHash('sha256').update(emailVerifyRaw).digest('hex');

  const result = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: payload.businessName.trim(),
        portalType,
        businessType,
        category: payload.category.trim(),
        description: payload.description?.trim() || null,
        gstin,
        pan: payload.pan ? payload.pan.trim().toUpperCase() : null,
        licenses: payload.licenses || null,
        gstVerified: false,
        identityVerified: false,
        documentsVerified: false,
        verificationStatus: 'PENDING_VERIFICATION',
        address: payload.address.trim(),
        city: payload.city.trim(),
        district: payload.district?.trim() || null,
        state: payload.state.trim(),
        pinCode: payload.pinCode.trim(),
        operatingRegions: payload.operatingRegions?.trim() || null,
        productionCapacity: payload.productionCapacity?.trim() || null,
        vehicleTypes: payload.vehicleTypes?.trim() || null
      }
    });

    const hqBranch = await tx.branch.create({
      data: {
        organizationId: org.id,
        name: `${org.name} — HQ`,
        type: businessType === 'MANUFACTURER' ? 'FACTORY' : businessType === 'RETAILER' ? 'STORE' : 'HQ',
        address: org.address,
        city: org.city,
        district: org.district,
        state: org.state,
        pinCode: org.pinCode,
        isPrimary: true
      }
    });

    const user = await tx.user.create({
      data: {
        email,
        phone,
        fullName: payload.fullName.trim(),
        passwordHash,
        role: businessType,
        status: 'PENDING_VERIFICATION',
        emailVerified: false,
        businessProfile: {
          create: {
            organizationId: org.id,
            businessName: org.name,
            businessType,
            category: org.category,
            description: org.description,
            gstin,
            pan: org.pan,
            gstVerified: false,
            address: org.address,
            city: org.city,
            district: org.district,
            state: org.state,
            pinCode: org.pinCode,
            productionCapacity: org.productionCapacity,
            operatingRegions: org.operatingRegions,
            vehicleTypes: org.vehicleTypes,
            verification: {
              create: {
                status: 'PENDING_VERIFICATION',
                history: [
                  {
                    action: 'SUBMITTED',
                    at: new Date().toISOString(),
                    notes: 'Initial business registration submitted.'
                  }
                ]
              }
            }
          }
        },
        memberships: {
          create: {
            organizationId: org.id,
            isOwner: true,
            branchId: hqBranch.id,
            designation: 'Business Owner',
            employmentStatus: 'ACTIVE',
            permissions: ['*']
          }
        },
        emailVerificationToken: {
          create: {
            tokenHash: emailVerifyHash,
            expiresAt: new Date(Date.now() + 24 * 3600 * 1000)
          }
        }
      },
      include: {
        businessProfile: true,
        memberships: { include: { organization: true, branch: true } }
      }
    });

    return { user, org, emailVerifyRaw };
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[SAHAYAK] Email verification link for ${email}: ${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/#/verify-email?token=${result.emailVerifyRaw}`);
  }

  return result;
}

/**
 * Worker Invite-Only Registration:
 * Workers can ONLY join an existing organization using a valid, unexpired, PENDING invitation code.
 * They cannot independently create an organization or claim owner/admin roles.
 */
export async function joinAsInvitedWorker({ inviteCode, email, password, phone = null }) {
  const cleanCode = String(inviteCode || '').trim().toUpperCase();
  const cleanEmail = String(email || '').toLowerCase().trim();
  const codeHash = crypto.createHash('sha256').update(cleanCode).digest('hex');

  const invitation = await prisma.workerInvitation.findUnique({
    where: { codeHash },
    include: { organization: true, branch: true }
  });

  if (!invitation || invitation.status !== 'PENDING') {
    throw new Error('Invitation code is invalid or has already been used.');
  }
  if (invitation.expiresAt < new Date()) {
    await prisma.workerInvitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } });
    throw new Error('Invitation code has expired. Please request a new invitation from your manager.');
  }
  if (invitation.email.toLowerCase() !== cleanEmail) {
    throw new Error('This invitation code was issued for a different email address.');
  }

  const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
  if (existing) {
    throw new Error('An account with this email already exists.');
  }

  const passwordHash = await hashPassword(password);
  const perms = Array.isArray(invitation.permissions) && invitation.permissions.length > 0
    ? invitation.permissions
    : (WORKER_DEFAULT_PERMISSIONS[invitation.workerRole] || []);

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        email: cleanEmail,
        phone: phone ? phone.trim() : null,
        fullName: invitation.fullName,
        passwordHash,
        role: 'WORKER',
        status: 'ACTIVE', // Organization manager already authorized the worker via invitation
        emailVerified: true,
        memberships: {
          create: {
            organizationId: invitation.organizationId,
            isOwner: false,
            workerRole: invitation.workerRole,
            employeeId: invitation.employeeId,
            department: invitation.department,
            designation: invitation.designation,
            managerId: invitation.invitedById,
            branchId: invitation.branchId,
            employmentStatus: 'ACTIVE',
            permissions: perms
          }
        }
      },
      include: {
        businessProfile: true,
        memberships: { include: { organization: true, branch: true } }
      }
    });

    await tx.workerInvitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() }
    });

    await tx.notification.create({
      data: {
        userId: invitation.invitedById,
        category: 'WORKER',
        title: 'Worker Joined Organization',
        body: `${invitation.fullName} (${invitation.workerRole.replace(/_/g, ' ')}) accepted your invitation.`
      }
    }).catch(() => {});

    return createdUser;
  });

  return { user, invitation };
}

export async function handleGoogleIdToken({ idToken, selectedRole, linkPassword }) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.email_verified) {
    throw new Error('Google identity token could not be verified.');
  }

  const email = payload.email.toLowerCase();
  const sub = payload.sub;

  const existingOAuth = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: 'google', providerAccountId: sub } },
    include: {
      user: {
        include: {
          businessProfile: true,
          memberships: { include: { organization: true, branch: true } }
        }
      }
    }
  });
  if (existingOAuth) {
    return { status: 'AUTHENTICATED', user: existingOAuth.user };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: {
      businessProfile: true,
      memberships: { include: { organization: true, branch: true } }
    }
  });
  if (existingUser) {
    if (!linkPassword) {
      return {
        status: 'LINK_REQUIRED',
        message: 'An account with this email already exists. Verify your password to link Google.'
      };
    }
    const valid = await verifyPassword(existingUser.passwordHash, linkPassword);
    if (!valid) {
      throw new Error('Password verification failed. Cannot link Google account.');
    }
    await prisma.oAuthAccount.create({
      data: {
        userId: existingUser.id,
        provider: 'google',
        providerAccountId: sub,
        email
      }
    });
    return { status: 'AUTHENTICATED', user: existingUser };
  }

  const normalizedRole = selectedRole ? String(selectedRole).toUpperCase() : null;
  if (!normalizedRole || !PUBLIC_BUSINESS_TYPES.has(normalizedRole)) {
    return {
      status: 'ROLE_SELECTION_REQUIRED',
      profile: { email, fullName: payload.name || email.split('@')[0] }
    };
  }

  const newUser = await prisma.user.create({
    data: {
      email,
      fullName: payload.name || email.split('@')[0],
      role: normalizedRole,
      status: 'INCOMPLETE_PROFILE',
      emailVerified: true,
      oauthAccounts: {
        create: {
          provider: 'google',
          providerAccountId: sub,
          email
        }
      }
    },
    include: {
      businessProfile: true,
      memberships: { include: { organization: true, branch: true } }
    }
  });

  return { status: 'AUTHENTICATED', user: newUser };
}

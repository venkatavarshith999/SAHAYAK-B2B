import argon2 from 'argon2';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../config/db.js';
import {
  PUBLIC_BUSINESS_TYPES,
  mapBusinessTypeToPortal,
  WORKER_DEFAULT_PERMISSIONS
} from '../config/permissions.js';

function getGoogleClient() {
  return new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
}

function getPendingSigningKey() {
  const secret = process.env.SESSION_SECRET || process.env.CSRF_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is required for Google OAuth pending state.');
  return secret;
}

export function signPendingGoogleToken(payload) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + 10 * 60 * 1000 }),
    'utf8'
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', getPendingSigningKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyPendingGoogleToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', getPendingSigningKey()).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!parsed || !parsed.exp || parsed.exp < Date.now()) return null;
    if (!parsed.sub || !parsed.email || !parsed.mode) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setPendingGoogleCookie(res, payload) {
  const signed = signPendingGoogleToken(payload);
  res.cookie('sahayak_google_pending', signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000
  });
}

export function clearPendingGoogleCookie(res) {
  res.clearCookie('sahayak_google_pending');
}

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

export async function verifyGoogleIdToken(idToken) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error('Google OAuth is not configured on this server.');
  }
  const client = getGoogleClient();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.email || !payload.email_verified || !payload.sub) {
    throw new Error('Google identity token could not be verified or email is unverified.');
  }
  return {
    sub: String(payload.sub),
    email: String(payload.email).toLowerCase().trim(),
    fullName: String(payload.name || payload.email.split('@')[0]).trim()
  };
}

export async function resolveGoogleIdentity({ sub, email, fullName }) {
  const existingOAuth = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: 'google', providerAccountId: sub } },
    include: {
      user: {
        include: {
          businessProfile: { include: { verification: { include: { _count: { select: { documents: true } } } } } },
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
      businessProfile: { include: { verification: { include: { _count: { select: { documents: true } } } } } },
      memberships: { include: { organization: true, branch: true } }
    }
  });
  if (existingUser) {
    return {
      status: 'LINK_REQUIRED',
      profile: { sub, email, fullName: existingUser.fullName || fullName },
      message: 'An account with this email already exists. Verify your password to link Google.'
    };
  }

  return {
    status: 'ROLE_SELECTION_REQUIRED',
    profile: { sub, email, fullName }
  };
}

export async function linkGoogleAccount({ sub, email, password }) {
  const cleanEmail = String(email || '').toLowerCase().trim();
  const existingUser = await prisma.user.findUnique({
    where: { email: cleanEmail },
    include: {
      businessProfile: { include: { verification: { include: { _count: { select: { documents: true } } } } } },
      memberships: { include: { organization: true, branch: true } }
    }
  });
  if (!existingUser) {
    throw new Error('Account not found for linking.');
  }
  if (existingUser.status === 'REJECTED' || existingUser.status === 'SUSPENDED') {
    throw new Error(`Account is ${existingUser.status.toLowerCase()}. Please contact support.`);
  }
  if (!existingUser.passwordHash) {
    throw new Error('This account does not have a password set. Please use password reset first.');
  }
  const valid = await verifyPassword(existingUser.passwordHash, password);
  if (!valid) {
    const err = new Error('Incorrect password. Cannot link Google account.');
    err.statusCode = 401;
    throw err;
  }

  const duplicateSub = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: 'google', providerAccountId: sub } }
  });
  if (duplicateSub && duplicateSub.userId !== existingUser.id) {
    throw new Error('This Google account is already linked to another Sahayak user.');
  }

  if (!duplicateSub) {
    await prisma.$transaction([
      prisma.oAuthAccount.create({
        data: {
          userId: existingUser.id,
          provider: 'google',
          providerAccountId: sub,
          email: cleanEmail
        }
      }),
      prisma.user.update({
        where: { id: existingUser.id },
        data: { emailVerified: true }
      })
    ]);
  }

  const refreshed = await prisma.user.findUnique({
    where: { id: existingUser.id },
    include: {
      businessProfile: { include: { verification: { include: { _count: { select: { documents: true } } } } } },
      memberships: { include: { organization: true, branch: true } }
    }
  });
  return { user: refreshed };
}

/**
 * Registers a brand-new business account authenticated via verified Google OAuth.
 * Creates User (emailVerified=true, passwordHash=null) + OAuthAccount + Organization + HQ Branch + Owner Membership + BusinessProfile + BusinessVerification atomically.
 */
export async function registerGoogleBusinessAccount(googleIdentity, payload) {
  const businessType = String(payload.businessType || payload.role || '').toUpperCase();
  if (!PUBLIC_BUSINESS_TYPES.has(businessType)) {
    throw new Error('Selected business type is not eligible for public business registration.');
  }

  const portalType = mapBusinessTypeToPortal(businessType);
  const email = String(googleIdentity.email || '').toLowerCase().trim();
  const sub = String(googleIdentity.sub || '').trim();
  const phone = payload.phone ? payload.phone.trim() : null;
  const gstin = payload.gstin ? payload.gstin.trim().toUpperCase() : null;

  if (['WHOLESALER', 'MANUFACTURER', 'DISTRIBUTOR'].includes(businessType) && !gstin) {
    throw new Error(`GSTIN is required for ${businessType.toLowerCase()} accounts.`);
  }

  const existingOAuth = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: 'google', providerAccountId: sub } }
  });
  if (existingOAuth) {
    throw new Error('This Google account is already registered. Please sign in with Google.');
  }

  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    throw new Error('An account with this email already exists. Please sign in and link your Google account.');
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
        fullName: (payload.fullName || googleIdentity.fullName || email.split('@')[0]).trim(),
        passwordHash: null,
        role: businessType,
        status: 'PENDING_VERIFICATION',
        emailVerified: true,
        oauthAccounts: {
          create: {
            provider: 'google',
            providerAccountId: sub,
            email
          }
        },
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
                    notes: 'Business registration submitted via verified Google account.'
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
        }
      },
      include: {
        businessProfile: { include: { verification: { include: { _count: { select: { documents: true } } } } } },
        memberships: { include: { organization: true, branch: true } }
      }
    });

    return { user, org };
  });

  return result;
}

export async function handleGoogleIdToken({ idToken, selectedRole, linkPassword }) {
  const identity = await verifyGoogleIdToken(idToken);
  const resolved = await resolveGoogleIdentity(identity);

  if (resolved.status === 'AUTHENTICATED') {
    return resolved;
  }

  if (resolved.status === 'LINK_REQUIRED') {
    if (!linkPassword) {
      return resolved;
    }
    const { user } = await linkGoogleAccount({
      sub: identity.sub,
      email: identity.email,
      password: linkPassword
    });
    return { status: 'AUTHENTICATED', user };
  }

  const normalizedRole = selectedRole ? String(selectedRole).toUpperCase() : null;
  if (!normalizedRole || !PUBLIC_BUSINESS_TYPES.has(normalizedRole)) {
    return resolved;
  }

  const newUser = await prisma.user.create({
    data: {
      email: identity.email,
      fullName: identity.fullName,
      role: normalizedRole,
      status: 'INCOMPLETE_PROFILE',
      emailVerified: true,
      oauthAccounts: {
        create: {
          provider: 'google',
          providerAccountId: identity.sub,
          email: identity.email
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

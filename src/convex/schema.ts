/** GuardAsli — اسکیمای مرکزی پایگاه داده. هویت Core فقط GuardAsli/AsliCode. */
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema(
  {
    tenants: defineTable({
      name: v.string(),
      status: v.string(),
      planId: v.optional(v.id("plans")),
      parentTenantId: v.optional(v.id("tenants")),
      config: v.optional(v.any()),
    })
      .index("by_status", ["status"])
      .index("by_parent", ["parentTenantId"]),

    users: defineTable({
      username: v.string(),
      email: v.optional(v.string()),
      passwordHash: v.string(),
      passwordSalt: v.string(),
      role: v.string(),
      tenantId: v.id("tenants"),
      parentUserId: v.optional(v.id("users")),
      telegramUserId: v.optional(v.number()),
      status: v.string(),
      failedLogins: v.optional(v.number()),
      blockedUntil: v.optional(v.number()),
    })
      .index("by_username", ["username"])
      .index("by_tenant", ["tenantId"])
      .index("by_telegram", ["telegramUserId"])
      .index("by_parent", ["parentUserId"]),

    sessions: defineTable({
      userId: v.id("users"),
      tokenHash: v.string(),
      refreshTokenHash: v.optional(v.string()),
      status: v.string(),
      userAgent: v.optional(v.string()),
      ip: v.optional(v.string()),
      expiresAt: v.number(),
      rotatedFrom: v.optional(v.id("sessions")),
    })
      .index("by_token", ["tokenHash"])
      .index("by_user", ["userId"])
      .index("by_refresh", ["refreshTokenHash"])
      .index("by_status_expires", ["status", "expiresAt"]),

    plans: defineTable({
      tenantId: v.id("tenants"),
      name: v.string(),
      kind: v.string(),
      price: v.number(),
      trafficGb: v.optional(v.number()),
      users: v.optional(v.number()),
      durationDays: v.optional(v.number()),
      servers: v.optional(v.number()),
      subResellers: v.optional(v.number()),
      apps: v.optional(v.number()),
      builds: v.optional(v.number()),
      devices: v.optional(v.number()),
      apiKeys: v.optional(v.number()),
      features: v.array(v.string()),
      permissions: v.array(v.string()),
      status: v.string(),
    }).index("by_tenant", ["tenantId"]),

    featureFlags: defineTable({
      key: v.string(),
      globallyEnabled: v.boolean(),
      canPurchaseSeparately: v.boolean(),
      canResell: v.boolean(),
      internalCost: v.number(),
      defaultPrice: v.number(),
      minimumPrice: v.number(),
      maximumPrice: v.optional(v.number()),
      resellerPrice: v.optional(v.number()),
    }).index("by_key", ["key"]),

    planFeatures: defineTable({
      planId: v.id("plans"),
      featureKey: v.string(),
      enabled: v.boolean(),
    })
      .index("by_plan", ["planId"])
      .index("by_plan_feature", ["planId", "featureKey"]),

    wallets: defineTable({
      tenantId: v.id("tenants"),
      userId: v.id("users"),
      balance: v.number(),
      seq: v.number(),
      status: v.string(),
    })
      .index("by_user", ["userId"])
      .index("by_tenant", ["tenantId"]),

    ledgerEntries: defineTable({
      walletId: v.id("wallets"),
      tenantId: v.id("tenants"),
      seq: v.number(),
      type: v.string(),
      amount: v.number(),
      direction: v.string(),
      balanceAfter: v.number(),
      reason: v.string(),
      idempotencyKey: v.optional(v.string()),
      metadata: v.optional(v.any()),
      createdAt: v.number(),
    })
      .index("by_wallet_seq", ["walletId", "seq"])
      .index("by_idempotency", ["idempotencyKey"])
      .index("by_tenant_time", ["tenantId", "createdAt"]),

    payments: defineTable({
      tenantId: v.id("tenants"),
      userId: v.id("users"),
      method: v.string(),
      amount: v.number(),
      status: v.string(),
      providerPaymentId: v.optional(v.string()),
      providerPayload: v.optional(v.any()),
      cardId: v.optional(v.id("paymentCards")),
      receiptStorageId: v.optional(v.id("_storage")),
      ledgerEntryId: v.optional(v.id("ledgerEntries")),
      attemptCount: v.optional(v.number()),
      idempotencyKey: v.optional(v.string()),
      createdAt: v.number(),
      reviewedBy: v.optional(v.id("users")),
      reviewedAt: v.optional(v.number()),
      paymentLink: v.optional(v.string()),
    })
      .index("by_user", ["userId"])
      .index("by_tenant_status", ["tenantId", "status"])
      .index("by_provider_payment", ["providerPaymentId"])
      .index("by_idempotency", ["idempotencyKey"]),

    paymentCards: defineTable({
      tenantId: v.id("tenants"),
      number: v.string(),
      numberLast4: v.optional(v.string()),
      numberEncrypted: v.optional(v.string()),
      ownerName: v.string(),
      enabled: v.boolean(),
      order: v.number(),
    })
      .index("by_tenant", ["tenantId"])
      .index("by_tenant_order", ["tenantId", "order"]),

    paymentMethods: defineTable({
      key: v.string(),
      globallyEnabled: v.boolean(),
      config: v.optional(v.any()),
    }).index("by_key", ["key"]),

    paymentProviders: defineTable({
      key: v.string(),
      enabled: v.boolean(),
      configEncrypted: v.string(),
    }).index("by_key", ["key"]),

    userPaymentConfigs: defineTable({
      userId: v.id("users"),
      tenantId: v.id("tenants"),
      provider: v.string(),
      credentialsEncrypted: v.string(),
      baseUrl: v.optional(v.string()),
      enabled: v.boolean(),
      label: v.optional(v.string()),
      updatedAt: v.number(),
    })
      .index("by_user_provider", ["userId", "provider"])
      .index("by_tenant", ["tenantId"]),

    providers: defineTable({
      tenantId: v.id("tenants"),
      kind: v.string(),
      name: v.string(),
      baseUrl: v.string(),
      credentialsEncrypted: v.string(),
      capabilities: v.array(v.string()),
      status: v.string(),
    }).index("by_tenant", ["tenantId"]),

    servers: defineTable({
      tenantId: v.id("tenants"),
      providerId: v.id("providers"),
      name: v.string(),
      remoteRef: v.string(),
      status: v.string(),
      lastHealthAt: v.optional(v.number()),
    })
      .index("by_tenant", ["tenantId"])
      .index("by_provider", ["providerId"]),

    subscriptions: defineTable({
      tenantId: v.id("tenants"),
      userId: v.id("users"),
      planId: v.optional(v.id("plans")),
      serverId: v.optional(v.id("servers")),
      remoteUserId: v.optional(v.string()),
      kind: v.string(),
      trafficLimitGb: v.optional(v.number()),
      trafficUsedGb: v.optional(v.number()),
      userLimit: v.optional(v.number()),
      durationDays: v.optional(v.number()),
      durationEndsAt: v.optional(v.number()),
      status: v.string(),
      provisioningState: v.string(),
      provisionAttempts: v.optional(v.number()),
      lastProvisionError: v.optional(v.string()),
      activatedAt: v.optional(v.number()),
    })
      .index("by_user", ["userId"])
      .index("by_tenant", ["tenantId"])
      .index("by_server", ["serverId"])
      .index("by_status", ["status"]),

    /** دستگاه‌های کلاینت VPN (سقف multi-device) */
    clientDevices: defineTable({
      tenantId: v.id("tenants"),
      userId: v.id("users"),
      deviceKey: v.string(),
      name: v.string(),
      platform: v.string(),
      status: v.string(),
      lastSeenAt: v.number(),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_key", ["userId", "deviceKey"])
      .index("by_tenant", ["tenantId"]),

    provisionJobs: defineTable({
      tenantId: v.id("tenants"),
      subscriptionId: v.id("subscriptions"),
      attempt: v.number(),
      maxAttempts: v.number(),
      nextRunAt: v.number(),
      status: v.string(),
      lastError: v.optional(v.string()),
    })
      .index("by_status_next", ["status", "nextRunAt"])
      .index("by_subscription", ["subscriptionId"]),

    botConfigs: defineTable({
      tenantId: v.id("tenants"),
      tokenEncrypted: v.string(),
      username: v.optional(v.string()),
      displayName: v.string(),
      description: v.optional(v.string()),
      webhookSecret: v.string(),
      enabled: v.boolean(),
    }).index("by_tenant", ["tenantId"]),

    botUsers: defineTable({
      botConfigId: v.id("botConfigs"),
      telegramUserId: v.number(),
      platformUserId: v.optional(v.id("users")),
      state: v.optional(v.string()),
    }).index("by_bot_user", ["botConfigId", "telegramUserId"]),

    branding: defineTable({
      tenantId: v.id("tenants"),
      displayName: v.string(),
      logoStorageId: v.optional(v.id("_storage")),
      faviconStorageId: v.optional(v.id("_storage")),
      primaryColor: v.string(),
      secondaryColor: v.string(),
      accentColor: v.string(),
      backgroundColor: v.string(),
      theme: v.string(),
      font: v.optional(v.string()),
      supportUrl: v.optional(v.string()),
      websiteUrl: v.optional(v.string()),
      privacyUrl: v.optional(v.string()),
      termsUrl: v.optional(v.string()),
      whiteLabel: v.boolean(),
    }).index("by_tenant", ["tenantId"]),

    assets: defineTable({
      tenantId: v.id("tenants"),
      kind: v.string(),
      storageId: v.id("_storage"),
      checksum: v.string(),
      contentType: v.string(),
      size: v.number(),
      createdAt: v.number(),
    }).index("by_tenant", ["tenantId"]),

    uiTexts: defineTable({
      tenantId: v.id("tenants"),
      locale: v.string(),
      key: v.string(),
      value: v.string(),
    })
      .index("by_tenant_locale", ["tenantId", "locale"])
      .index("by_tenant_key", ["tenantId", "key"]),

    customDomains: defineTable({
      tenantId: v.id("tenants"),
      domain: v.string(),
      verificationToken: v.string(),
      verified: v.boolean(),
      sslStatus: v.string(),
      sslExpiresAt: v.optional(v.number()),
      isWildcard: v.boolean(),
    })
      .index("by_domain", ["domain"])
      .index("by_tenant", ["tenantId"]),

    appCustomizations: defineTable({
      tenantId: v.id("tenants"),
      appKind: v.string(),
      appName: v.string(),
      shortName: v.optional(v.string()),
      description: v.optional(v.string()),
      packageName: v.optional(v.string()),
      bundleId: v.optional(v.string()),
      version: v.string(),
      buildNumber: v.number(),
      logoStorageId: v.optional(v.id("_storage")),
      splashStorageId: v.optional(v.id("_storage")),
      primaryColor: v.string(),
      secondaryColor: v.string(),
      accentColor: v.string(),
      backgroundColor: v.string(),
      themeMode: v.string(),
      featureFlags: v.array(v.string()),
      supportUrl: v.optional(v.string()),
      reportsUrl: v.optional(v.string()),
      websiteUrl: v.optional(v.string()),
      privacyUrl: v.optional(v.string()),
      termsUrl: v.optional(v.string()),
      telegramBotUrl: v.optional(v.string()),
      telegramChannelUrl: v.optional(v.string()),
    }).index("by_tenant_kind", ["tenantId", "appKind"]),

    builds: defineTable({
      tenantId: v.id("tenants"),
      appCustomizationId: v.id("appCustomizations"),
      status: v.string(),
      platform: v.string(),
      version: v.string(),
      buildNumber: v.number(),
      artifactStorageId: v.optional(v.id("_storage")),
      artifactChecksum: v.optional(v.string()),
      logsStorageId: v.optional(v.id("_storage")),
      startedAt: v.optional(v.number()),
      finishedAt: v.optional(v.number()),
      queuePosition: v.optional(v.number()),
    })
      .index("by_tenant", ["tenantId"])
      .index("by_status", ["status"])
      .index("by_customization", ["appCustomizationId"]),

    releases: defineTable({
      tenantId: v.id("tenants"),
      component: v.string(),
      version: v.string(),
      notes: v.optional(v.string()),
      artifactStorageId: v.optional(v.id("_storage")),
      checksum: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_component_version", ["component", "version"])
      .index("by_component", ["component"]),

    healthChecks: defineTable({
      target: v.string(),
      targetId: v.optional(v.string()),
      state: v.string(),
      latencyMs: v.optional(v.number()),
      checkedAt: v.number(),
    }).index("by_target_time", ["target", "checkedAt"]),

    jobs: defineTable({
      kind: v.string(),
      tenantId: v.optional(v.id("tenants")),
      payload: v.optional(v.any()),
      status: v.string(),
      attempts: v.number(),
      maxAttempts: v.number(),
      nextRunAt: v.number(),
      lastError: v.optional(v.string()),
    })
      .index("by_status_next", ["status", "nextRunAt"])
      .index("by_kind", ["kind"]),

    backups: defineTable({
      kind: v.string(),
      scope: v.string(),
      tenantId: v.optional(v.id("tenants")),
      storageId: v.id("_storage"),
      checksum: v.string(),
      encrypted: v.boolean(),
      createdAt: v.number(),
      status: v.string(),
    }).index("by_time", ["createdAt"]),

    auditLogs: defineTable({
      tenantId: v.optional(v.id("tenants")),
      actorUserId: v.optional(v.id("users")),
      action: v.string(),
      entityType: v.string(),
      entityId: v.optional(v.string()),
      metadata: v.optional(v.any()),
      ip: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_tenant_time", ["tenantId", "createdAt"])
      .index("by_actor", ["actorUserId"]),

    apiKeys: defineTable({
      tenantId: v.id("tenants"),
      createdBy: v.id("users"),
      name: v.string(),
      prefix: v.string(),
      keyHash: v.string(),
      scopes: v.array(v.string()),
      status: v.string(),
      expiresAt: v.optional(v.number()),
      lastUsedAt: v.optional(v.number()),
    })
      .index("by_prefix", ["prefix"])
      .index("by_tenant", ["tenantId"]),

    rateLimits: defineTable({
      bucketKey: v.string(),
      windowStart: v.number(),
      count: v.number(),
    }).index("by_bucket", ["bucketKey"]),

    referralRules: defineTable({
      tenantId: v.id("tenants"),
      enabled: v.boolean(),
      commissionPct: v.number(),
    }).index("by_tenant", ["tenantId"]),

    referrals: defineTable({
      tenantId: v.id("tenants"),
      referrerUserId: v.id("users"),
      referredUserId: v.id("users"),
      commissionLedgerEntryId: v.optional(v.id("ledgerEntries")),
      createdAt: v.number(),
    })
      .index("by_referrer", ["referrerUserId"])
      .index("by_referred", ["referredUserId"]),

    reportSnapshots: defineTable({
      tenantId: v.id("tenants"),
      kind: v.string(),
      periodStart: v.number(),
      periodEnd: v.number(),
      data: v.any(),
      createdAt: v.number(),
    }).index("by_tenant_kind", ["tenantId", "kind"]),

    systemSettings: defineTable({
      key: v.string(),
      value: v.any(),
    }).index("by_key", ["key"]),
  },
  { schemaValidation: true },
);

/** GuardAsli — اسکیمای مرکزی پایگاه داده. هویت Core فقط GuardAsli/AsliCode. */
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema(
  {
    // ————— Multi-tenancy —————
    tenants: defineTable({
      name: v.string(), // display name — قابل شخصی‌سازی کامل
      status: v.string(), // active | suspended
      planId: v.optional(v.id("plans")),
      parentTenantId: v.optional(v.id("tenants")),
      config: v.optional(v.any()),
    })
      .index("by_status", ["status"])
      .index("by_parent", ["parentTenantId"]),

    // ————— Users / RBAC —————
    users: defineTable({
      username: v.string(),
      email: v.optional(v.string()),
      passwordHash: v.string(),
      passwordSalt: v.string(),
      role: v.string(),
      tenantId: v.id("tenants"),
      parentUserId: v.optional(v.id("users")),
      telegramUserId: v.optional(v.number()),
      status: v.string(), // active | suspended | blocked
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
      status: v.string(), // active | revoked
      userAgent: v.optional(v.string()),
      ip: v.optional(v.string()),
      expiresAt: v.number(),
      rotatedFrom: v.optional(v.id("sessions")),
    })
      .index("by_token", ["tokenHash"])
      .index("by_user", ["userId"])
      .index("by_refresh", ["refreshTokenHash"]),

    // ————— Plans / Features —————
    plans: defineTable({
      tenantId: v.id("tenants"),
      name: v.string(),
      kind: v.string(), // volume | user
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
      status: v.string(), // active | archived
    })
      .index("by_tenant", ["tenantId"]),

    featureFlags: defineTable({
      key: v.string(), // FeatureKey
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

    // ————— Wallet / Ledger —————
    wallets: defineTable({
      tenantId: v.id("tenants"),
      userId: v.id("users"),
      balance: v.number(),
      seq: v.number(),
      status: v.string(), // active | frozen
    })
      .index("by_user", ["userId"])
      .index("by_tenant", ["tenantId"]),

    ledgerEntries: defineTable({
      walletId: v.id("wallets"),
      tenantId: v.id("tenants"),
      seq: v.number(),
      type: v.string(),
      amount: v.number(),
      direction: v.string(), // credit | debit
      balanceAfter: v.number(),
      reason: v.string(),
      idempotencyKey: v.optional(v.string()),
      metadata: v.optional(v.any()),
      createdAt: v.number(),
    })
      .index("by_wallet_seq", ["walletId", "seq"])
      .index("by_idempotency", ["idempotencyKey"]),

    // ————— Payments —————
    payments: defineTable({
      tenantId: v.id("tenants"),
      userId: v.id("users"),
      method: v.string(), // admin_manual | card_to_card | cubepay | tetraminator
      amount: v.number(),
      status: v.string(), // pending_review | awaiting_verify | paid | rejected | fraud | canceled
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
    })
      .index("by_user", ["userId"])
      .index("by_tenant_status", ["tenantId", "status"])
      .index("by_provider_payment", ["providerPaymentId"])
      .index("by_idempotency", ["idempotencyKey"]),

    paymentCards: defineTable({
      tenantId: v.id("tenants"),
      number: v.string(),
      ownerName: v.string(),
      enabled: v.boolean(),
      order: v.number(),
    })
      .index("by_tenant", ["tenantId"])
      .index("by_tenant_order", ["tenantId", "order"]),

    paymentMethods: defineTable({
      key: v.string(), // admin_manual | card_to_card | cubepay | tetraminator
      globallyEnabled: v.boolean(),
      config: v.optional(v.any()),
    }).index("by_key", ["key"]),

    paymentProviders: defineTable({
      key: v.string(), // cubepay | tetraminator
      enabled: v.boolean(),
      configEncrypted: v.string(), // AES-256-GCM envelope
    }).index("by_key", ["key"]),

    // ————— Servers / Providers —————
    providers: defineTable({
      tenantId: v.id("tenants"),
      kind: v.string(), // xui | sanaei | pasarguard | rebecca
      name: v.string(),
      baseUrl: v.string(),
      credentialsEncrypted: v.string(),
      capabilities: v.array(v.string()),
      status: v.string(), // active | unreachable | disabled
    })
      .index("by_tenant", ["tenantId"]),

    servers: defineTable({
      tenantId: v.id("tenants"),
      providerId: v.id("providers"),
      name: v.string(),
      remoteRef: v.string(),
      status: v.string(), // active | degraded | down
      lastHealthAt: v.optional(v.number()),
    })
      .index("by_tenant", ["tenantId"])
      .index("by_provider", ["providerId"]),

    // ————— Subscriptions / Provisioned users —————
    subscriptions: defineTable({
      tenantId: v.id("tenants"),
      userId: v.id("users"),
      planId: v.optional(v.id("plans")),
      serverId: v.optional(v.id("servers")),
      remoteUserId: v.optional(v.string()),
      kind: v.string(), // volume | user
      trafficLimitGb: v.optional(v.number()),
      trafficUsedGb: v.optional(v.number()),
      userLimit: v.optional(v.number()),
      durationEndsAt: v.optional(v.number()),
      status: v.string(), // created | pending | active | expired | suspended | cancelled | refunded
      provisioningState: v.string(), // none | queued | provisioning | provisioned | failed
      provisionAttempts: v.optional(v.number()),
      lastProvisionError: v.optional(v.string()),
      activatedAt: v.optional(v.number()),
    })
      .index("by_user", ["userId"])
      .index("by_tenant", ["tenantId"])
      .index("by_server", ["serverId"])
      .index("by_status", ["status"]),

    // ————— Provisioning queue —————
    provisionJobs: defineTable({
      tenantId: v.id("tenants"),
      subscriptionId: v.id("subscriptions"),
      attempt: v.number(),
      maxAttempts: v.number(),
      nextRunAt: v.number(),
      status: v.string(), // queued | running | done | failed | dead
      lastError: v.optional(v.string()),
    })
      .index("by_status_next", ["status", "nextRunAt"])
      .index("by_subscription", ["subscriptionId"]),

    // ————— Telegram —————
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
    })
      .index("by_bot_user", ["botConfigId", "telegramUserId"]),

    // ————— Branding / Theming (tenant layer — کاملاً قابل شخصی‌سازی) —————
    branding: defineTable({
      tenantId: v.id("tenants"),
      displayName: v.string(),
      logoStorageId: v.optional(v.id("_storage")),
      faviconStorageId: v.optional(v.id("_storage")),
      primaryColor: v.string(),
      secondaryColor: v.string(),
      accentColor: v.string(),
      backgroundColor: v.string(),
      theme: v.string(), // light | dark | system
      font: v.optional(v.string()),
      supportUrl: v.optional(v.string()),
      websiteUrl: v.optional(v.string()),
      privacyUrl: v.optional(v.string()),
      termsUrl: v.optional(v.string()),
      whiteLabel: v.boolean(),
    }).index("by_tenant", ["tenantId"]),

    assets: defineTable({
      tenantId: v.id("tenants"),
      kind: v.string(), // logo | favicon | icon | splash | receipt | other
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
      sslStatus: v.string(), // none | pending | issued | failed
      sslExpiresAt: v.optional(v.number()),
      isWildcard: v.boolean(),
    })
      .index("by_domain", ["domain"])
      .index("by_tenant", ["tenantId"]),

    // ————— Apps / Builder / Builds —————
    appCustomizations: defineTable({
      tenantId: v.id("tenants"),
      appKind: v.string(), // mainapp | dedicated
      appName: v.string(),
      shortName: v.optional(v.string()),
      description: v.optional(v.string()),
      packageName: v.optional(v.string()),
      bundleId: v.optional(v.string()),
      version: v.string(), // isMAJOR.MINOR.PATCH
      buildNumber: v.number(),
      logoStorageId: v.optional(v.id("_storage")),
      splashStorageId: v.optional(v.id("_storage")),
      primaryColor: v.string(),
      secondaryColor: v.string(),
      accentColor: v.string(),
      backgroundColor: v.string(),
      themeMode: v.string(), // light | dark | system
      featureFlags: v.array(v.string()),
      supportUrl: v.optional(v.string()),
      reportsUrl: v.optional(v.string()),
      websiteUrl: v.optional(v.string()),
      privacyUrl: v.optional(v.string()),
      termsUrl: v.optional(v.string()),
      telegramBotUrl: v.optional(v.string()),
      telegramChannelUrl: v.optional(v.string()),
    })
      .index("by_tenant_kind", ["tenantId", "appKind"]),

    builds: defineTable({
      tenantId: v.id("tenants"),
      appCustomizationId: v.id("appCustomizations"),
      status: v.string(), // queued | running | success | failed | cancelled
      platform: v.string(), // android | ios | web
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

    // ————— Monitoring / Jobs / Backup —————
    healthChecks: defineTable({
      target: v.string(), // api | database | redis | workers | providers | telegram | ssl | disk | payment_webhooks | build
      targetId: v.optional(v.string()),
      state: v.string(), // healthy | degraded | down | unknown
      latencyMs: v.optional(v.number()),
      checkedAt: v.number(),
    }).index("by_target_time", ["target", "checkedAt"]),

    jobs: defineTable({
      kind: v.string(), // provider_sync | health_check | expiry | notifications | reports | backup | ssl_renewal | payment_verify | provision_retry | build
      tenantId: v.optional(v.id("tenants")),
      payload: v.optional(v.any()),
      status: v.string(), // queued | running | done | failed | dead
      attempts: v.number(),
      maxAttempts: v.number(),
      nextRunAt: v.number(),
      lastError: v.optional(v.string()),
    })
      .index("by_status_next", ["status", "nextRunAt"])
      .index("by_kind", ["kind"]),

    backups: defineTable({
      kind: v.string(), // auto | manual
      scope: v.string(), // full | tenant
      tenantId: v.optional(v.id("tenants")),
      storageId: v.id("_storage"),
      checksum: v.string(),
      encrypted: v.boolean(),
      createdAt: v.number(),
      status: v.string(), // created | restored | verified | failed
    }).index("by_time", ["createdAt"]),

    // ————— Audit / Logs —————
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

    // ————— API keys —————
    apiKeys: defineTable({
      tenantId: v.id("tenants"),
      createdBy: v.id("users"),
      name: v.string(),
      prefix: v.string(),
      keyHash: v.string(),
      scopes: v.array(v.string()),
      status: v.string(), // active | revoked
      expiresAt: v.optional(v.number()),
      lastUsedAt: v.optional(v.number()),
    })
      .index("by_prefix", ["prefix"])
      .index("by_tenant", ["tenantId"]),

    // ————— Rate limiting —————
    rateLimits: defineTable({
      bucketKey: v.string(),
      windowStart: v.number(),
      count: v.number(),
    }).index("by_bucket", ["bucketKey"]),

    // ————— Referral / Commission —————
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

    // ————— Reports —————
    reportSnapshots: defineTable({
      tenantId: v.id("tenants"),
      kind: v.string(), // users | traffic | sales | revenue | wallet | payments | subscriptions | servers | builds | apps
      periodStart: v.number(),
      periodEnd: v.number(),
      data: v.any(),
      createdAt: v.number(),
    }).index("by_tenant_kind", ["tenantId", "kind"]),

    // ————— System settings —————
    systemSettings: defineTable({
      key: v.string(),
      value: v.any(),
    }).index("by_key", ["key"]),
  },
  { schemaValidation: true },
);

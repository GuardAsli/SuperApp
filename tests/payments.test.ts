/** GuardAsli — تست‌های پرداخت (بند ۴۴): CubePay، Tetraminator، ضد-replay. */
import { describe, expect, test } from "bun:test";
import { cubePayAdapter, validateCubePayConfig, CUBEPAY_BASE } from "../src/core/payments/cubepay";
import {
  tetraminatorAdapter, validateTetraminatorConfig,
  TETRAMINATOR_MIN, TETRAMINATOR_MAX,
} from "../src/core/payments/tetraminator";

const fetchOk = (body: unknown) => async () =>
  new Response(JSON.stringify(body), { status: 200 });

describe("CubePay طبق مستندات رسمی", () => {
  const cfg = { token: "test_token_1234567890", baseUrl: CUBEPAY_BASE };
  test("اعتبارسنجی config", () => {
    expect(validateCubePayConfig(cfg).ok).toBe(true);
    expect(validateCubePayConfig({ token: "", baseUrl: CUBEPAY_BASE }).ok).toBe(false);
  });
  test("createPayment درخواست رسمی می‌سازد", async () => {
    let captured: RequestInit | undefined;
    let url = "";
    const fakeFetch = ((u: unknown, init?: RequestInit) => {
      url = String(u);
      captured = init;
      return Promise.resolve(new Response(JSON.stringify({
        success: true,
        authority: "8f2a1c",
        paymentLink: "https://cubevps.ir/smspay/pay.php?authority=8f2a1c",
        payAmount: 250770,
        payAmountToman: 25077,
        isTest: true,
      }), { status: 200 }));
    }) as unknown as typeof fetch;
    const res = await cubePayAdapter.createPayment(
      cfg,
      { amountRials: 250000, orderId: "order-1029", callbackUrl: "https://example.com/cb" },
      fakeFetch,
    );
    expect(url).toBe(`${CUBEPAY_BASE}/api/v1/create-payment.php`);
    const body = JSON.parse(String(captured?.body));
    expect(body.amount).toBe(250000);
    expect(body.order_id).toBe("order-1029");
    expect((captured?.headers as Record<string, string>).Authorization).toBe(`Bearer ${cfg.token}`);
    expect(res.success).toBe(true);
    expect(res.authority).toBe("8f2a1c");
  });
  test("createPayment حداقل مبلغ را رد می‌کند", async () => {
    expect(cubePayAdapter.createPayment(cfg, {
      amountRials: 500, orderId: "x", callbackUrl: "https://example.com/cb",
    }, fetchOk({} as never) as unknown as typeof fetch)).rejects.toThrow();
  });
  test("verifyPayment authority را ارسال می‌کند", async () => {
    let body = "";
    const res = await cubePayAdapter.verifyPayment(
      cfg, "auth123",
      (async (_u: unknown, init?: RequestInit) => {
        body = String(init?.body);
        return new Response(JSON.stringify({ success: true, status: "paid" }), { status: 200 });
      }) as unknown as typeof fetch,
    );
    expect(JSON.parse(body).authority).toBe("auth123");
    expect(res.success).toBe(true);
  });
});

describe("Tetraminator با verify و ضد-replay", () => {
  const cfg = { apiKey: "api_key_1234567890", baseUrl: "https://api.example.com/v1" };
  test("اعتبارسنجی config", () => {
    expect(validateTetraminatorConfig(cfg).ok).toBe(true);
    expect(validateTetraminatorConfig({ apiKey: "", baseUrl: "https://api.example.com/v1" }).ok).toBe(false);
  });
  test("حدود مبلغ ۵۰٬۰۰۰ تا ۱۰٬۰۰۰٬۰۰۰", async () => {
    expect(tetraminatorAdapter.createInvoice(cfg, {
      price: TETRAMINATOR_MIN - 1, callbackUrl: "https://example.com/cb",
    }, fetchOk({}) as unknown as typeof fetch)).rejects.toThrow();
    expect(tetraminatorAdapter.createInvoice(cfg, {
      price: TETRAMINATOR_MAX + 1, callbackUrl: "https://example.com/cb",
    }, fetchOk({}) as unknown as typeof fetch)).rejects.toThrow();
  });
  test("createInvoice با X-API-KEY", async () => {
    let headers: Record<string, string> | undefined;
    const res = await tetraminatorAdapter.createInvoice(
      cfg,
      { price: 500000, callbackUrl: "https://example.com/cb" },
      (async (_u: unknown, init?: RequestInit) => {
        headers = init?.headers as Record<string, string>;
        return new Response(JSON.stringify({ pay_id: "pay123", payment_link: "https://pay.example/x" }), { status: 200 });
      }) as unknown as typeof fetch,
    );
    expect(headers?.["X-API-KEY"]).toBe(cfg.apiKey);
    expect(res.pay_id).toBe("pay123");
  });
  test("verify فقط با paid + مطابقت مبلغ قبول می‌شود", async () => {
    const ok = await tetraminatorAdapter.verifyPayment(
      cfg, "pay1", 500000,
      fetchOk({ status: true, payment_status: "paid", amount: 500000, pay_id: "pay1" }) as unknown as typeof fetch,
    );
    expect(ok.accepted).toBe(true);

    const unpaid = await tetraminatorAdapter.verifyPayment(
      cfg, "pay1", 500000,
      fetchOk({ status: true, payment_status: "pending", amount: 500000 }) as unknown as typeof fetch,
    );
    expect(unpaid.accepted).toBe(false);

    const amountMismatch = await tetraminatorAdapter.verifyPayment(
      cfg, "pay1", 999,
      fetchOk({ status: true, payment_status: "paid", amount: 500000 }) as unknown as typeof fetch,
    );
    expect(amountMismatch.accepted).toBe(false);

    const statusFalse = await tetraminatorAdapter.verifyPayment(
      cfg, "pay1", 500000,
      fetchOk({ status: false, payment_status: "paid" }) as unknown as typeof fetch,
    );
    expect(statusFalse.accepted).toBe(false);
  });
});

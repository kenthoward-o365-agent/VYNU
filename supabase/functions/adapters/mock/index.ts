// Mock adapter for development and end-to-end testing without external dependencies.
import { registerAdapter, type PosAdapter, type PosOrderUpdate } from "../../_shared/pos-adapter.ts";

const adapter: PosAdapter = {
  slug: "mock",
  async authenticate() {
    return { token: "mock-token", expiresAt: Date.now() + 60_000 };
  },
  async testConnection() {
    return { ok: true, message: "Mock provider connected" };
  },
  async pushMenu() {
    return { ok: true };
  },
  async pullOrders(): Promise<PosOrderUpdate[]> {
    return [];
  },
  async updateOrderStatus() {},
  async snoozeProduct() {},
};

registerAdapter(adapter);
export default adapter;

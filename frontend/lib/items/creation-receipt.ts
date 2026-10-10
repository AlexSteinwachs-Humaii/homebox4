/** Ephemeral navigation receipt, never URL-derived or stored across reloads.
 * This is feedback state only; the detail page must still fetch authorized data.
 */
export function createReceiptStore() {
  let receipt: { collectionId: string; entityId: string } | null = null;
  return {
    clear() {
      receipt = null;
    },
    publish(collectionId: string, entityId: string) {
      receipt = { collectionId, entityId };
    },
    take(collectionId: string | null | undefined, entityId: string): boolean {
      const current = receipt;
      receipt = null;
      return !!current && current.collectionId === collectionId && current.entityId === entityId;
    },
  };
}

// Client-only app: deliberately not Pinia/useState, localStorage, or route query state.
export const creationReceipt = createReceiptStore();

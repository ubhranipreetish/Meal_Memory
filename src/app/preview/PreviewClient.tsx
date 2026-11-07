"use client";

import dynamic from "next/dynamic";

/**
 * The prototype restores its demo state from localStorage/sessionStorage, so
 * server-rendering it would either mismatch on hydration or force the restore
 * into an effect (cascading renders). Rendering it client-only lets it read
 * storage straight into its initial state.
 */
const Companion = dynamic(() => import("../companion"), {
  ssr: false,
  loading: () => <main className="app" />,
});

export function PreviewClient({ screen }: { screen: string }) {
  return <Companion screen={screen} />;
}

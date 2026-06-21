"use client";

import { useCallback, useEffect, useState } from "react";

type FriendEntry = { id: string; displayName: string; userId: string };

type FriendsData = {
  friends: FriendEntry[];
  incoming: FriendEntry[];
  outgoing: FriendEntry[];
};

export default function FriendsModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<FriendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchName, setSearchName] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/friends");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchName.trim()) return;
    setSending(true);
    setSendError(null);
    setSendSuccess(null);
    const res = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: searchName.trim() }),
    });
    const json = await res.json();
    setSending(false);
    if (!res.ok) {
      setSendError(json.error ?? "Something went wrong.");
    } else {
      setSendSuccess(`Friend request sent to ${json.toDisplayName}!`);
      setSearchName("");
      load();
    }
  };

  const respond = async (id: string, action: "accept" | "reject") => {
    await fetch(`/api/friends/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    load();
  };

  const remove = async (id: string) => {
    await fetch(`/api/friends/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 p-6 rounded-xl space-y-5 max-w-sm w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Friends</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-100 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Add friend */}
        <form onSubmit={sendRequest} className="space-y-2">
          <label className="block text-sm text-neutral-400">Add friend by display name</label>
          <div className="flex gap-2">
            <input
              value={searchName}
              onChange={(e) => { setSearchName(e.target.value); setSendError(null); setSendSuccess(null); }}
              placeholder="Enter display name..."
              className="flex-1 rounded-xl bg-neutral-800 px-3 py-2 text-sm outline-none ring-1 ring-neutral-700 focus:ring-emerald-600"
            />
            <button
              type="submit"
              disabled={sending || !searchName.trim()}
              className="px-3 py-2 bg-emerald-600 text-white text-sm rounded-xl hover:bg-emerald-700 disabled:opacity-50"
            >
              {sending ? "..." : "Send"}
            </button>
          </div>
          {sendError && (
            <p className="text-xs text-red-400">{sendError}</p>
          )}
          {sendSuccess && (
            <p className="text-xs text-emerald-400">{sendSuccess}</p>
          )}
        </form>

        <div className="overflow-y-auto space-y-5 flex-1">
          {loading ? (
            <p className="text-sm text-neutral-400">Loading...</p>
          ) : (
            <>
              {/* Incoming requests */}
              {(data?.incoming.length ?? 0) > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs uppercase text-neutral-500 tracking-wide">
                    Incoming requests ({data!.incoming.length})
                  </h3>
                  {data!.incoming.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2">
                      <span className="text-sm truncate">{r.displayName}</span>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => respond(r.id, "accept")}
                          className="px-2 py-1 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => respond(r.id, "reject")}
                          className="px-2 py-1 bg-neutral-700 text-neutral-300 text-xs rounded-lg hover:bg-neutral-600"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {/* Friends */}
              <section className="space-y-2">
                <h3 className="text-xs uppercase text-neutral-500 tracking-wide">
                  Friends ({data?.friends.length ?? 0})
                </h3>
                {(data?.friends.length ?? 0) === 0 ? (
                  <p className="text-sm text-neutral-500">No friends yet.</p>
                ) : (
                  data!.friends.map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-2">
                      <span className="text-sm truncate">{f.displayName}</span>
                      <button
                        onClick={() => remove(f.id)}
                        className="text-xs text-neutral-500 hover:text-red-400 shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </section>

              {/* Outgoing requests */}
              {(data?.outgoing.length ?? 0) > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs uppercase text-neutral-500 tracking-wide">
                    Pending sent ({data!.outgoing.length})
                  </h3>
                  {data!.outgoing.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2">
                      <span className="text-sm text-neutral-400 truncate">{r.displayName}</span>
                      <button
                        onClick={() => remove(r.id)}
                        className="text-xs text-neutral-500 hover:text-red-400 shrink-0"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

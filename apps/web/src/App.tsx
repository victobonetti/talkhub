import { useEffect, useRef, useState } from "react";
import { Client, type Room } from "colyseus.js";
import { ROOM_AMBIENTE } from "@talkhub/shared";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "ws://localhost:2567";

/**
 * M0: smoke test do realtime. Conecta na sala de teste e mostra os jogadores.
 * A game view real (mapa + chat + proximidade) entra nos próximos milestones.
 */
export function App() {
  const [status, setStatus] = useState("desconectado");
  const [players, setPlayers] = useState<string[]>([]);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    const client = new Client(SERVER_URL);
    let active = true;

    client
      .joinOrCreate(ROOM_AMBIENTE, { displayName: "dev" })
      .then((room) => {
        if (!active) {
          void room.leave();
          return;
        }
        roomRef.current = room;
        setStatus(`conectado (sala ${room.roomId})`);
        room.onStateChange((state) => {
          const map = state.players as { keys(): IterableIterator<string> };
          setPlayers(Array.from(map.keys()));
        });
      })
      .catch((e: unknown) => {
        setStatus(`erro: ${e instanceof Error ? e.message : String(e)}`);
      });

    return () => {
      active = false;
      void roomRef.current?.leave();
    };
  }, []);

  return (
    <main style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>Talkhub — M0</h1>
      <p>Status: {status}</p>
      <p>Jogadores na sala: {players.length}</p>
      <ul>
        {players.map((id) => (
          <li key={id}>{id}</li>
        ))}
      </ul>
    </main>
  );
}

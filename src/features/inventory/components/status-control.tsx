"use client";

import { useState, useTransition } from "react";
import { Select } from "@/components/ui/input";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { deleteVehicle, setVehicleStatus } from "../actions";
import { VEHICLE_STATUS } from "../constants";

export function VehicleStatusControl({ id, status }: { id: string; status: string }) {
  const [value, setValue] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <Select aria-label="Status do veículo" value={value} disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          start(async () => { const r = await setVehicleStatus(id, next); if (!r.ok) { setError(r.error ?? "Erro"); setValue(status); } });
        }}>
        {VEHICLE_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </Select>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export function DeleteVehicleButton({ id }: { id: string }) {
  return <ConfirmButton label="Excluir veículo" confirmLabel="Excluir veículo e fotos" onConfirm={() => deleteVehicle(id)} />;
}

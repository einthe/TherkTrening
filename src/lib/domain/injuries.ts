import { z } from "zod";
import { label, payloadSchemas, type EventRecord } from "./events";
import { componentSchemas, type Instance } from "./components";

export const injuryInputSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(80),
    notes: z.string().max(4000).default(""),
  })
  .strict();
export type InjuryInput = z.infer<typeof injuryInputSchema>;
export type Injury = InjuryInput & { updatedAt: string };

export function injuryName(id: string, injuries: Injury[]) {
  return injuries.find((injury) => injury.id === id)?.name ?? label(id);
}

export function withLegacyPainTitles(
  events: EventRecord[],
  instances: Instance[],
): EventRecord[] {
  const cards = instances.filter(
    (i) => i.componentDefinitionId === "pain_logger",
  );
  return events.map((event) => {
    if (event.eventType !== "pain_measurement" || event.schemaVersion !== 1)
      return event;
    const parsed = payloadSchemas.pain_measurement.safeParse(event.payload);
    if (!parsed.success || parsed.data.name) return event;
    const readings =
      "readings" in parsed.data ? parsed.data.readings : [parsed.data];
    const matches = cards.filter((card) => {
      const config = componentSchemas.pain_logger.safeParse(card.config);
      return (
        config.success &&
        readings.every((r) => config.data.targets.includes(r.injuryId))
      );
    });
    return matches.length === 1
      ? { ...event, payload: { ...parsed.data, name: matches[0].title } }
      : event;
  });
}

export function legacyInjuries(
  events: EventRecord[],
  instances: Instance[],
): Injury[] {
  const ids = new Set<string>();
  for (const instance of instances) {
    if (instance.componentDefinitionId === "pain_logger") {
      const config = componentSchemas.pain_logger.safeParse(instance.config);
      if (config.success) config.data.targets.forEach((id) => ids.add(id));
    }
    if (instance.componentDefinitionId === "graph") {
      const config = componentSchemas.graph.safeParse(instance.config);
      if (config.success)
        for (const source of config.data.sources) {
          for (const step of source.pipeline) {
            if (step.key === "filter_target" && step.field === "injuryId")
              ids.add(step.value);
          }
        }
    }
  }
  for (const event of events) {
    if (event.eventType !== "pain_measurement") continue;
    const payload = payloadSchemas.pain_measurement.safeParse(event.payload);
    if (payload.success) {
      const readings =
        "readings" in payload.data ? payload.data.readings : [payload.data];
      readings.forEach((r) => ids.add(r.injuryId));
    }
  }
  return [...ids].map((id) => ({
    id,
    name: label(id),
    notes: "",
    updatedAt: "2000-01-01T00:00:00.000Z",
  }));
}

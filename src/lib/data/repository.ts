import type {
  WorkoutTemplate,
  TemplateInput,
  CustomExercise,
} from "@/lib/domain/workouts";
import type { EventInput, EventRecord, Profile } from "@/lib/domain/events";
import type {
  Definition,
  Instance,
  InstanceInput,
} from "@/lib/domain/components";
export type Snapshot = {
  profile: Profile;
  workoutTemplates: WorkoutTemplate[];
  customExercises: CustomExercise[];
  events: EventRecord[];
  instances: Instance[];
  definitions: {
    components: Definition[];
    events: Definition[];
    operators: Definition[];
  };
};
export type Mutation =
  | { action: "saveWorkoutTemplate"; template: TemplateInput }
  | { action: "createExercise"; exercise: CustomExercise }
  | { action: "createEvents"; events: EventInput[] }
  | { action: "editEvent"; event: EventInput; expectedUpdatedAt: string }
  | { action: "deleteEvent"; id: string; expectedUpdatedAt: string }
  | {
      action: "lockEvent";
      id: string;
      locked: boolean;
      expectedUpdatedAt: string;
    }
  | {
      action: "saveInstance";
      instance: InstanceInput;
      expectedUpdatedAt?: string;
    }
  | { action: "removeInstance"; id: string }
  | { action: "reorder"; ids: string[] };
export interface Repository {
  load(): Promise<Snapshot>;
  mutate(mutation: Mutation): Promise<void>;
}
export class HttpRepository implements Repository {
  async load() {
    const response = await fetch("/api/data", { cache: "no-store" });
    const body = await response.json().catch(() => ({
      error: "The server could not complete the request. Please try again.",
    }));
    if (!response.ok)
      throw new Error(body.error ?? "Unable to load your data.");
    return body as Snapshot;
  }
  async mutate(mutation: Mutation) {
    const response = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mutation),
    });
    if (!response.ok) {
      const body = await response
        .json()
        .catch(() => ({ error: "Unable to save. Please try again." }));
      throw new Error(body.error ?? "Unable to save. Please try again.");
    }
  }
}

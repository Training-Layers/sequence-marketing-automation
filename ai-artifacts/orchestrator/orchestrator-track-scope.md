Below is an updated **v3** specification to share with your development team, incorporating the **recommended enhancements** for type safety and composite track support, as well as ensuring alignment with Trigger.dev’s approach and terminology.

---

# **Track & Orchestrator Specification (v3)**

## **1. Overview & Motivation**

As we build **Trigger.dev** pipelines with multiple dependent tasks, we need a clean way to:
1. **Chain tasks** in a linear sequence where each task’s output feeds the next.
2. **Coordinate multiple chains** in parallel or with partial ordering (dependencies across chains).

We introduce:

- **Tracks**: Synchronously executed sequences (chains) of tasks.
- **Orchestrators**: Oversee one or more **Tracks**, determining the order, parallel execution, and final merges.

Using these structures, you separate **task logic** (in the Task Registry) from **execution flow** (Tracks and Orchestrators), preventing your code from becoming too complex as it grows.

---

## **2. Tracks**

### **2.1 What Is a Track?**

A **Track** is a **sequential** pipeline of tasks:

- Tasks run **synchronously**—each task starts only when the previous finishes.
- The **output** of each task can serve as the **input** of the next.
- Typically you’d define a **Track** when you have a straightforward chain of tasks.

### **2.2 Basic Untyped Definitions**

If you do **not** need advanced type-checking, you might do something like:

```ts
export interface TrackTaskDefinition {
  taskName: string;
  /**
   * Maps the previous task’s output to this task’s input (or static input).
   */
  inputMapper?: (prevOutput: any) => any;
}

export interface TrackDefinition {
  name: string;
  tasks: TrackTaskDefinition[];
}

/**
 * Example runner for a single Track
 */
export async function runTrack(track: TrackDefinition) {
  let prevOutput: any = null;
  for (const step of track.tasks) {
    const input = step.inputMapper ? step.inputMapper(prevOutput) : {};
    // e.g. call your actual task runner that references your Task Registry
    const output = await executeTask(step.taskName, input);
    prevOutput = output;
  }
}
```

### **2.3 Enhanced Type Safety**

We strongly recommend making tracks **type-safe** by leveraging your **TaskRegistry**. For instance, if your registry is something like:

```ts
export const tasks = {
  media_audio_extract: {
    input: { /* shape of inputs */ },
    output: { /* shape of outputs */ },
    /* ... */
  },
  video_strip_audios: { /* ... */ },
} as const;

export type TaskRegistry = typeof tasks;
export type TaskName = keyof TaskRegistry;
```

Then you can define **typed** track interfaces:

```ts
type TaskInput<T extends keyof TaskRegistry> = TaskRegistry[T]["input"];
type TaskOutput<T extends keyof TaskRegistry> = TaskRegistry[T]["output"];

export interface TypedTrackTaskDefinition<T extends keyof TaskRegistry> {
  taskName: T;
  /**
   * Maps the previous task’s output type to this task’s input type.
   */
  inputMapper?: (prevOutput: TaskOutput<any>) => TaskInput<T>;
}

export interface TypedTrackDefinition {
  name: string;
  tasks: TypedTrackTaskDefinition<keyof TaskRegistry>[];
}
```

This way, if you try to feed the wrong type of output into the next task’s input, TypeScript will warn you at compile time.

### **2.4 Composite Track Support**

You might want a “track” that internally has **sub-tracks** running in parallel, or a place to unify multiple smaller tracks into one. For such a case, you can define a **composite** track:

```ts
export interface CompositeTrackDefinition extends TypedTrackDefinition {
  type: "composite";
  /**
   * Each subTrack can run in parallel or partial-parallel, depending on your logic.
   */
  subTracks: TypedTrackDefinition[];
  /**
   * Merges outputs from each subTrack in a custom way.
   */
  mergeStrategy: (outputs: Record<string, any>[]) => Promise<any>;
}

// Example usage
const compositeTrack: CompositeTrackDefinition = {
  name: "CompositeAudioProcessing",
  type: "composite",
  tasks: [], // you can have top-level tasks if needed
  subTracks: [
    { name: "AudioExtractTrack", tasks: [ /* ...typed tasks... */ ] },
    { name: "SpeechToTextTrack", tasks: [ /* ...typed tasks... */ ] },
  ],
  mergeStrategy: async (outputs) => {
    // Combine sub-track results
    return {
      combinedAudio: outputs[0],
      combinedTranscription: outputs[1],
    };
  }
};
```

---

## **3. Orchestrators**

### **3.1 What Is an Orchestrator?**

An **Orchestrator** controls **one or more Tracks**:

- Can run multiple tracks **in parallel** (no dependency) or enforce partial ordering if needed.
- Optionally merges outputs or triggers final tasks after dependent tracks finish.
- Provides a higher-level blueprint than a single track.

### **3.2 Basic Untyped Orchestrator**

```ts
export interface OrchestratorDefinition {
  name: string;
  tracks: TrackDefinition[]; // or TypedTrackDefinition[]
  trackDependencies?: Record<string, string[]>;
  trackInputMappings?: Record<string, (outputs: Record<string, any>) => any>;
}

/**
 * Example orchestrator runner
 */
export async function runOrchestrator(def: OrchestratorDefinition) {
  const outputs: Record<string, any> = {};
  const completed = new Set<string>();
  const depCount: Record<string, number> = {};

  // build dependency counts
  for (const trackDef of def.tracks) {
    depCount[trackDef.name] = def.trackDependencies?.[trackDef.name]?.length ?? 0;
  }

  // function to start tracks that have no remaining dependencies
  async function maybeStartTracks() {
    const ready = Object.entries(depCount)
      .filter(([trackName, count]) => count === 0 && !completed.has(trackName))
      .map(([trackName]) => trackName);

    await Promise.all(
      ready.map(async (trackName) => {
        // optional input
        let input = {};
        if (def.trackInputMappings && def.trackInputMappings[trackName]) {
          input = def.trackInputMappings[trackName](outputs);
        }

        const trackDef = def.tracks.find((t) => t.name === trackName)!;
        console.log(`Starting track: ${trackName}`);
        const result = await runTrack(trackDef /*, input if needed */);
        outputs[trackName] = result;
        completed.add(trackName);

        // reduce dependency count
        for (const [otherTrack, deps] of Object.entries(def.trackDependencies || {})) {
          if (deps.includes(trackName)) {
            depCount[otherTrack]--;
          }
        }

        await maybeStartTracks();
      })
    );
  }

  await maybeStartTracks();

  if (completed.size !== def.tracks.length) {
    throw new Error("Some tracks didn't complete. Possibly cyclical dependency or error.");
  }

  return outputs;
}
```

### **3.3 Handling Single Tasks Outside Tracks**

Sometimes you might need a quick **final merge** or single finishing step that doesn’t fit well into a track. You can just define a helper function:

```ts
export async function runSingleTask(taskName: string, input: any) {
  return executeTask(taskName, input);
}
```

The orchestrator can call that single task at the end (e.g., merging audio + video).

---

## **4. Example Scenario**

**Goal**: Convert a WebM video’s human voice to an AI voice, using an audio track pipeline and a video pipeline, then merge them.

1. **Audio-Processing Track**  
   - Extract audio (`media_audio_extract`).  
   - Speech-to-text (Deepgram).  
   - Convert JSON to SRT.  
   - Split SRT into segments.  
   - ElevenLabs TTS for each segment.  
   - Combine segments to one final MP3.

2. **Video-Processing Track**  
   - Strip audio from video (`video_strip_audios`).  
   - Split into 10 parts, store in R2.  
   - Transcode each part.  
   - Combine into a single MP4.

3. **Final Merge**  
   - Orchestrator calls a single `merge_audio_video` task using the final MP3 + MP4.

### **4.1 Example Track Definitions (Typed)**

```ts
import { TypedTrackDefinition } from "./track-typed"; // your typed definitions

export const audioTrack: TypedTrackDefinition = {
  name: "AudioProcessingTrack",
  tasks: [
    { taskName: "media_audio_extract" },
    { taskName: "deepgram_speech_to_text" },
    { taskName: "convert_json_to_srt" },
    { taskName: "split_srt_into_segments" },
    { taskName: "elevenlabs_text_to_speech_batch" },
    { taskName: "combine_audio_segments" },
  ],
};

export const videoTrack: TypedTrackDefinition = {
  name: "VideoProcessingTrack",
  tasks: [
    { taskName: "video_strip_audios" },
    { taskName: "split_video" },
    { taskName: "transcode_video_segments" },
    { taskName: "combine_video_segments" },
  ],
};
```

### **4.2 Orchestrator Definition**

```ts
import { OrchestratorDefinition } from "./orchestrator";
import { audioTrack, videoTrack } from "./tracks";

export const orchestratorDef: OrchestratorDefinition = {
  name: "VideoAudioOrchestrator",
  tracks: [audioTrack, videoTrack],
  trackDependencies: {
    // e.g.: If "VideoProcessingTrack" depends on "AudioProcessingTrack"
    // "VideoProcessingTrack": ["AudioProcessingTrack"]
  },
  // If tracks need input from others, define trackInputMappings
};
```

### **4.3 End-to-End Flow**

```ts
async function runMyFlow() {
  const allTrackOutputs = await runOrchestrator(orchestratorDef);

  // Final single task merge
  const finalAudioUrl = allTrackOutputs.AudioProcessingTrack?.finalAudio;
  const finalVideoUrl = allTrackOutputs.VideoProcessingTrack?.finalVideo;
  const mergedResult = await runSingleTask("merge_audio_video", {
    audioUrl: finalAudioUrl,
    videoUrl: finalVideoUrl,
  });
  console.log("Merged final MP4:", mergedResult);
}
```

---

## **5. Additional Considerations**

1. **Data Mappings**  
   - For sequential flows, keep them local in the **Track**.  
   - For cross-track flows, define mappings in the **Orchestrator**.

2. **Typed Data Flow**  
   - If tasks have strict input/output schemas, typed track definitions help catch errors at compile time.

3. **Error Handling**  
   - Decide if a single failing track halts the entire orchestrator or if unaffected tracks continue.

4. **Composite Tracks**  
   - If you want a more advanced sub-flow inside one track, consider the **CompositeTrackDefinition** pattern.

5. **Logging & Metrics**  
   - Logging each track’s progress can help diagnose performance or debug issues.

6. **Long-Running or Parallel**  
   - The orchestrator can run multiple tracks in parallel if no dependencies exist. For partial dependencies, you can carefully define `trackDependencies`.

7. **Integration with Trigger.dev**  
   - Make sure each actual “taskName” references an entry in your Task Registry, which is then executed in the Trigger.dev environment (or wherever your tasks run).

---

## **6. Final Takeaways**

1. **Tracks**: Linear chains of tasks with optional data mapping from step to step.
2. **Composite Tracks**: Let you incorporate smaller sub-tracks or parallel segments inside a single “track.”
3. **Orchestrators**: 
   - Manage multiple tracks, scheduling them in parallel or with dependencies.
   - Provide a top-level view of the flow, including a final single-step merge if desired.
4. **Type Safety** (Recommended): 
   - Use typed definitions to ensure each task’s input is compatible with the previous output.
   - Greatly reduces run-time errors in complex flows.
5. **Modular & Extensible**: 
   - You can easily add new tasks, advanced concurrency rules, or error-handling logic without tangling your code.

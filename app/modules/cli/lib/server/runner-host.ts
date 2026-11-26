import { Array as Arr, Context, Effect, FileSystem, Option, String as Str } from "effect";
import type { CallFailure } from "./adapters/sdk.ts";

interface RunnerHost {
  readonly cookout: readonly string[];
  readonly osRelease: string;
  readonly platform: string;
  readonly uid: number;
  readonly wslConf: string;
}

type HostKind = "linux" | "macos" | "wsl2";

const SCRIPT_START = 1;
const SCRIPT_END = 2;
const NO_UID = 0;
const BOOT_SECTION = "[boot]";
const SYSTEMD_ON = /^systemd\s*=\s*true$/iu;

function userId(): number {
  return Option.getOrElse(
    Option.map(Option.fromNullishOr(process.getuid), (getuid) => getuid()),
    () => NO_UID,
  );
}

const RunnerHost = Context.Reference<RunnerHost>("cookout/cli/RunnerHost", {
  defaultValue: () => ({
    cookout: [process.execPath, ...process.argv.slice(SCRIPT_START, SCRIPT_END)],
    osRelease: "/proc/sys/kernel/osrelease",
    platform: process.platform,
    uid: userId(),
    wslConf: "/etc/wsl.conf",
  }),
});

function unsupported(platform: string): CallFailure {
  return {
    code: "unsupported_platform",
    message: `cookout runner install knows systemd (Linux, WSL2) and launchd (macOS), not ${platform}. Run cookout runner start yourself.`,
  };
}

function systemdOff(wslConf: string): CallFailure {
  return {
    code: "wsl_systemd_off",
    message:
      `systemd is off in ${wslConf}. Add the two lines "[boot]" and "systemd=true" to it (with sudo), run ` +
      "`wsl.exe --shutdown` in Windows, open WSL again, and run cookout runner install again.",
  };
}

function readIfThere(file: string): Effect.Effect<string, never, FileSystem.FileSystem> {
  return Effect.flatMap(FileSystem.FileSystem, (fs) => Effect.orElseSucceed(fs.readFileString(file), () => ""));
}

interface Section {
  readonly on: boolean;
  readonly section: string;
}

function readLine({ on, section }: Section, raw: string): Section {
  const line = Str.trim(raw);
  if (Str.startsWith("[")(line)) {
    return { on, section: Str.toLowerCase(line) };
  }
  return { on: on || (section === BOOT_SECTION && SYSTEMD_ON.test(line)), section };
}

function systemdOnIn(text: string): boolean {
  return Arr.reduce(Str.split("\n")(text), { on: false, section: "" }, readLine).on;
}

function kindOfLinux(host: RunnerHost): Effect.Effect<HostKind, never, FileSystem.FileSystem> {
  return Effect.map(readIfThere(host.osRelease), (release) => {
    if (Str.includes("microsoft")(Str.toLowerCase(release))) {
      return "wsl2";
    }
    return "linux";
  });
}

const wslSystemdOn: Effect.Effect<void, CallFailure, FileSystem.FileSystem> = Effect.gen(function* checkWslConf() {
  const host = yield* RunnerHost;
  const text = yield* readIfThere(host.wslConf);
  if (!systemdOnIn(text)) {
    return yield* Effect.fail(systemdOff(host.wslConf));
  }
  return yield* Effect.void;
});

const hostKind: Effect.Effect<HostKind, CallFailure, FileSystem.FileSystem> = Effect.gen(function* findHostKind() {
  const host = yield* RunnerHost;
  if (host.platform === "darwin") {
    return "macos";
  }
  if (host.platform !== "linux") {
    return yield* Effect.fail(unsupported(host.platform));
  }
  return yield* kindOfLinux(host);
});

function onRunnerHost(host: RunnerHost | undefined) {
  return <Value, Failure, Needs>(effect: Effect.Effect<Value, Failure, Needs>): Effect.Effect<Value, Failure, Needs> =>
    Option.match(Option.fromNullishOr(host), {
      onNone: () => effect,
      onSome: (given) => Effect.provideService(effect, RunnerHost, given),
    });
}

export { type HostKind, RunnerHost, hostKind, onRunnerHost, wslSystemdOn };

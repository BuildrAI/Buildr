/**
 * DSH software development kit (SDK) baselines this plugin may be built against.
 *
 * A plugin compiles against DSH internals, so a build is only valid for the exact baseline it used.
 * The manifest declares that baseline's whole minor line as the peer range, so a DSH runtime on the
 * same line accepts the plugin while versions older than the baseline or on the next minor line stay
 * refusable. Adding a baseline here is what makes a new DSH version buildable; nothing else guesses
 * a version.
 */
export interface DshSdkBaseline {
  /** DSH release tag in the upstream repository. */
  readonly tag: string;
  /** Exact commit the tag must resolve to. */
  readonly commit: string;
  /** Package version declared by that commit, and the peer version the plugin then requires. */
  readonly version: string;
}

export const DSH_SDK_BASELINES: readonly DshSdkBaseline[] = [
  { tag: 'dsh-v0.2.0-rc.1', commit: '4878cdabd87d4041bdaff61d04c966883b9fd07a', version: '0.2.0-rc.1' },
  // Kept because a plugin built for it still serves users on that DSH version.
  { tag: 'dsh-v0.1.7-rc.2', commit: '477b4f420553e8a52c2fbccc464d7561b239c443', version: '0.1.7-rc.2' },
] as const;

/** The baseline a build should use unless a caller names another: the newest verified one. */
export const DSH_SDK_DEFAULT_BASELINE: DshSdkBaseline = DSH_SDK_BASELINES[0]!;

/** Repository the baselines live in; the release archive of a tag is the source of truth. */
export const DSH_SDK_REPOSITORY = 'deepseek-ai/deepseek-harness';

export function findDshSdkBaseline(selector: string): DshSdkBaseline | undefined {
  return DSH_SDK_BASELINES.find(baseline => baseline.tag === selector || baseline.version === selector || baseline.commit === selector);
}

/** Where a fetched baseline lives, relative to the Buildr service root. */
export function dshSdkRoot(serviceRoot: string, baseline: DshSdkBaseline): string {
  return `${serviceRoot}/build/dsh-${baseline.version}`;
}

/** Marker recording which commit a fetched (non-git) checkout came from. */
export const DSH_SDK_COMMIT_MARKER = '.dsh-sdk-commit';

/** Project composition supplies package production; execution never loads the publisher. */
export interface CandidatePackageAdapter {
  read(env: NodeJS.ProcessEnv): any;
  create(productRoot: string, directory: string, options: { npmExecutable: string }): Promise<any>;
  environment: { tarball: string; metadata: string; manifest: string };
}

export async function loadCandidatePackageAdapter(): Promise<CandidatePackageAdapter> {
  const owner = await import('../../../../../../skills/buildr-release/scripts/candidate-package.ts');
  return { read: owner.readSharedCandidatePackage, create: owner.createCandidatePackage,
    environment: { tarball: owner.CANDIDATE_TARBALL_ENV, metadata: owner.CANDIDATE_PACK_METADATA_ENV,
      manifest: owner.CANDIDATE_RELEASE_MANIFEST_ENV } };
}

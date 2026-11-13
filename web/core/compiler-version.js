// A recording describes the engine that actually handled its source. The host
// Crystal installation and the latest upstream release are separate versions.
export function compilerVersionSummary(trace) {
  if (trace.mode === 'empty') return '';
  const parts = [];
  if (typeof trace.compiler_version === 'string' && trace.compiler_version)
    parts.push(`Crystal ${trace.compiler_version}`);
  if (typeof trace.llvm_version === 'string' && trace.llvm_version)
    parts.push(`LLVM ${trace.llvm_version}`);
  if (trace.mode === 'full' && trace.prelude) parts.push(`--prelude ${trace.prelude}`);
  if (parts.length) parts.push(`schema ${trace.schema_version}`);
  return parts.join(' · ');
}

export function compilerSourceURL(trace, file) {
  // Exact revisions also identify development builds. Older recordings with a
  // stable version use that release tag. Never substitute today's master for
  // a development build whose revision is unknown.
  const revision = trace.compiler_revision;
  const ref =
    typeof revision === 'string' && /^[a-f\d]{7,40}$/i.test(revision)
      ? revision
      : /^(\d+\.\d+\.\d+)(?=$|\s|\+)/.exec(trace.compiler_version || '')?.[1];
  return ref
    ? `https://github.com/crystal-lang/crystal/blob/${ref}/src/compiler/crystal/${file}`
    : null;
}

/** Qoder international and Qoder CN are independent products: separate CLIs,
 * configuration roots, credentials and regional endpoints. They share the COSY
 * signing scheme and the `/algo/api/v2` service shape, never an account. */
export type QoderProductId = 'qoder' | 'qoder-cn';

/** Independent model account that owns the Qoder CN login used by model-bound execution. */
export const qoderCnModelAccountId = 'native-qoder-cn';

export interface QoderProduct {
  id: QoderProductId;
  label: string;
  /** Native account configuration directory name under the Buildr connection root. */
  configDirectory: string;
  /** Environment variable that points the native CLI at its isolated config root. */
  configEnvironment: string;
  /** Default native home directory, used only to describe where login happens. */
  nativeHome: string;
  /** Installed program names accepted by local discovery. */
  executableNames: string[];
  /** Official install documentation shown when no program is available. */
  programUrl: string;
  /** npm package that bundles the compatible CLI for managed installs. */
  sdkPackage: string;
  /** Path of the bundled CLI inside the installed package. */
  sdkEntry: string;
  /** Version of the bundled CLI shipped with the default SDK package. */
  sdkVersion: string;
  /** Hosts whose browser login URLs may be surfaced to the user. */
  loginHosts: string[];
  api: {
    /** Model catalog and chat completions host. */
    gateway: string;
    /** OpenAPI host for quota reads. */
    openapi: string;
  };
}

const darwinOrWindows = process.platform === 'win32' ? '.exe' : '';

export const qoderProducts: Readonly<Record<QoderProductId, QoderProduct>> = Object.freeze({
  qoder: Object.freeze({
    id: 'qoder',
    label: 'Qoder',
    configDirectory: 'qoder-config',
    configEnvironment: 'QODER_CONFIG_DIR',
    nativeHome: '.qoder',
    executableNames: ['qodercli', 'qoder', 'qodercli.exe', 'qoder.exe'],
    programUrl: 'https://docs.qoder.com/zh/cli/sdk/overview',
    sdkPackage: '@qoder-ai/qoder-agent-sdk@1.0.55',
    sdkEntry: `node_modules/@qoder-ai/qoder-agent-sdk/dist/_bundled/qodercli${darwinOrWindows}`,
    sdkVersion: '1.1.75',
    loginHosts: ['qoder.com'],
    api: { gateway: 'https://api3.qoder.sh', openapi: 'https://center.qoder.sh' },
  }),
  'qoder-cn': Object.freeze({
    id: 'qoder-cn',
    label: 'Qoder CN',
    configDirectory: 'qoder-cn-config',
    configEnvironment: 'QODERCN_CONFIG_DIR',
    nativeHome: '.qoder-cn',
    executableNames: ['qodercn', 'qoderclicn', 'qoder-cn', 'qodercn.exe', 'qoderclicn.exe'],
    programUrl: 'https://docs.qoder.cn/cli/installation',
    sdkPackage: '@qodercn-ai/qoderclicn@1.1.86',
    sdkEntry: `node_modules/@qodercn-ai/qoderclicn/bin/qodercn${darwinOrWindows}`,
    sdkVersion: '1.1.86',
    loginHosts: ['qoder.cn', 'qoder.com.cn'],
    api: { gateway: 'https://gateway.qoder.com.cn', openapi: 'https://openapi.qoder.com.cn' },
  }),
});

export function qoderProduct(value: string | undefined): QoderProduct {
  if (value === 'qoder-cn') return qoderProducts['qoder-cn'];
  return qoderProducts.qoder;
}

/** Both products are Qoder identities; the product still decides credentials and endpoints. */
export function isQoderProvider(value: string | undefined): boolean {
  return value === 'qoder' || value === 'qoder-cn';
}

/** Native model leases are only valid for the account that produced them. */
export function qoderProviderOfConnection(connection: string | undefined): QoderProductId | undefined {
  return isQoderProvider(connection) ? connection as QoderProductId : undefined;
}

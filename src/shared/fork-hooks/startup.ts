// fork: 启动期是否等待浏览器分区代理。未登记时仍等待，和上游一致。

let deferBrowserSessionProxy = false

export function registerDeferBrowserSessionProxy(defer: boolean): void {
  deferBrowserSessionProxy = defer
}

export function shouldDeferBrowserSessionProxy(): boolean {
  return deferBrowserSessionProxy
}

export function resetStartupForkHooksForTests(): void {
  deferBrowserSessionProxy = false
}

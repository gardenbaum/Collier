/**
 * Module augmentation: register `tauri:options` as a known vendor
 * extension on `WebdriverIO.Capabilities`. `tauri-driver` consumes
 * this capability at session-creation time to know which binary to
 * launch. Without this, the wdio config's capability literal
 * would fail typecheck because the standard @wdio/types 9.x
 * VendorExtensions set is browser/cloud-only.
 */

declare global {
  namespace WebdriverIO {
    interface TauriOptions {
      /**
       * Absolute path to the built Collier binary. tauri-driver
       * launches this process when a new WebDriver session is
       * requested.
       */
      application: string
      /**
       * Optional explicit WebDriver port; defaults to 4440.
       */
      port?: number
    }

    // Augment the global Capabilities interface (which already
    // extends VendorExtensions) with the Tauri-specific extension.
    interface Capabilities {
      'tauri:options'?: TauriOptions
    }
  }
}

export {}

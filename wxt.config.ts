import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Doca',
    description: 'Workspaces that dock in their own window.',
    // Public key that fixes the extension ID in every Chromium browser.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkpLZORW9GtYws7Fzdb2cyMdNUxAxQoFAXTxA1Dw9K3duUhE1UXbMs4bRXSJbRYQjdI7mwCbzRpLkCJ8NIWY0ql9H8nioXqPi8afFvOLPtYSdpBgOjUPtDy9pZElss9Ad9MPRMmkfNd/SVDZsH3h2fLSBPxmkuJVvkiSRsVhp6XJDt/y/tq8FjAj9l0xrncfs+MEUW4ctiMYUfkWsNoTN0L0qYRIrDMkMAybViMQUjSJ0/fwkirDeZekdo1eeFb6lmaqQUNTT2+3q56LkPcoO0nsoaPDBJy02idiLIkLjMe88hRzNQS0gYk/KySLdpNA9NEf3/LhtUBz5Zak39S/cLQIDAQAB',
    permissions: ['tabs', 'storage', 'alarms'],
    action: { default_icon: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' } },
    omnibox: { keyword: 'doca' },
    commands: {
      _execute_action: { suggested_key: { default: 'Alt+Shift+W' } },
    },
  },
});

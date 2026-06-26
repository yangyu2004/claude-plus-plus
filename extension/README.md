# Claude History Rescue Panel

This browser extension injects a local recovered-conversations panel into Claude web.

## What it does

- Reads conversations from the local `claude-history-rescue-web` server
- Shows them in a fixed left-side panel on Claude web
- Lets you open the local conversation detail page in a new tab

## What it does not do

- It does not modify Claude's server-side history
- It does not write into Anthropic's internal data store

## Install

1. Start the local server:

```bash
cd claude-history-rescue-web
npm start -- --port 8789
```

2. Open `chrome://extensions`
3. Enable Developer mode
4. Load the `extension/` folder as an unpacked extension

## Config

The panel defaults to `http://127.0.0.1:8789`.
You can change the base URL from the `API` button in the panel.

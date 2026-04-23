# Discord Quest Bot v4.0

Ultimate Discord Quest bot with 30+ commands for tracking, monitoring, and auto-completing Discord quests.

## Features

- **Quest Tracking** - Track active, upcoming, and expired quests
- **Auto-Complete** - Selfbot engine for auto-completing video and play quests
- **Real-time Monitor** - Interactive quest monitoring with progress tracking
- **Notifications** - DM alerts and channel notifications for quest updates
- **Profile Effects & Collectibles** - Browse and track shop items
- **Regional Quests** - Filter quests by region availability
- **Cross-Platform** - PC, Mobile, and Cross-platform quest filtering

## Project Structure

```
src/
├── api/           # API client for Discord Quest API
├── canvas/        # Image generation utilities
├── commands/      # Command handlers (WIP)
├── config/        # Configuration constants
├── core/          # Client & state management
├── embeds/        # Discord embed builders
├── handlers/      # Event handlers (WIP)
├── monitor/       # Quest monitor UI & logic
├── notifications/ # Notification system
├── selfbot/       # Auto-complete engine
└── utils/         # Helper functions
```

## Installation

```bash
npm install
```

## Configuration

Create `.env` file:

```env
BOT_TOKEN=your_discord_bot_token
NOTIF_CHANNEL_ID=notification_channel_id
NOTIF_ROLE_ID=notification_role_id
```

## Usage

```bash
# Start the bot
npm start

# Check syntax
node -c index.js
```

## Available Commands

### Quest Commands
- `/quests` - List active quests
- `/quest` - Search quest by name
- `/questid` - Get quest by ID
- `/game` - Filter quests by game
- `/region` - Filter quests by region
- `/reward` - Filter quests by reward type

### Tracking Commands
- `/track` - Track a quest
- `/untrack` - Untrack a quest
- `/mytracks` - View tracked quests
- `/remindme` - Set quest reminder

### Info Commands
- `/endingsoon` - Quests ending in 24h
- `/upcoming` - Future quests
- `/crossplatform` - Cross-platform quests
- `/mobileonly` - Mobile-only quests
- `/pconly` - PC-only quests
- `/history` - Quest history

### Shop Commands
- `/collectibles` - List collectibles
- `/effects` - List profile effects
- `/shop` - Shop overview
- `/iteminfo` - Item details

### Other Commands
- `/regions` - Available regions
- `/myregion` - Set your region
- `/checkavailability` - Check quest availability
- `/stats` - Quest statistics
- `/botstats` - Bot statistics
- `/compare` - Compare two quests
- `/random` - Random quest
- `/qotd` - Quest of the day

### Prefix Commands (DM/Monitor)
- `;q` - Open quest monitor
- `;link` - Link Discord token
- `;unlink` - Unlink Discord token

## Selfbot Warning

The auto-complete feature uses user tokens which violates Discord's Terms of Service. Use at your own risk.

## License

MIT

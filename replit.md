# PlantEMS - Industrial Energy Management System

## Overview

PlantEMS is an industrial energy management system (EMS) designed for monitoring and controlling power consumption, devices, and alerts in plant/factory environments. The application provides real-time dashboards for tracking energy metrics, device status, and system alarms with a dark industrial-themed UI.

The system follows a full-stack TypeScript architecture with React frontend and Express backend, using PostgreSQL for data persistence. It implements Replit Auth for authentication and provides real-time data refresh capabilities for monitoring industrial equipment.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state with automatic 5-second polling for real-time updates
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom dark industrial theme (CSS variables in `client/src/index.css`)
- **Charts**: Recharts for data visualization (power consumption, voltage trends)
- **Forms**: React Hook Form with Zod validation

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Server**: HTTP server with Vite dev middleware in development
- **Database ORM**: Drizzle ORM with PostgreSQL
- **Session Management**: express-session with connect-pg-simple for PostgreSQL session storage
- **Authentication**: Replit Auth (OpenID Connect) via Passport.js

### Data Layer
- **Database**: PostgreSQL (configured via DATABASE_URL environment variable)
- **Schema Location**: `shared/schema.ts` - contains all table definitions
- **Migrations**: Drizzle Kit for schema migrations (`npm run db:push`)

### Key Tables
- `users` - User accounts with roles (admin, operator, viewer)
- `devices` - Industrial equipment (PLCs, Smart Meters, Sensors)
- `readings` - Time-series power/energy measurements
- `alerts` - System alarms with severity levels
- `sessions` - Authentication session storage

### API Design
- RESTful API defined in `shared/routes.ts` with Zod schema validation
- Endpoints follow pattern: `/api/{resource}/{action}`
- Input/output schemas shared between client and server for type safety

### Project Structure
```
├── client/           # React frontend
│   └── src/
│       ├── components/   # Reusable UI components
│       ├── pages/        # Route pages (Dashboard, Devices, Alarms, Analytics)
│       ├── hooks/        # Custom hooks (use-auth, use-ems, use-toast)
│       └── lib/          # Utilities and query client
├── server/           # Express backend
│   ├── replit_integrations/  # Replit Auth setup
│   └── storage.ts    # Database access layer
├── shared/           # Shared types and schemas
│   ├── schema.ts     # Drizzle table definitions
│   ├── routes.ts     # API contract definitions
│   └── models/       # Auth models
└── migrations/       # Database migrations
```

## External Dependencies

### Database
- **PostgreSQL**: Primary database, connection via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database queries and schema management

### Authentication
- **Replit Auth**: OpenID Connect authentication via Replit's identity provider
- Requires `REPL_ID`, `ISSUER_URL`, and `SESSION_SECRET` environment variables
- Session storage in PostgreSQL `sessions` table

### Frontend Libraries
- **Radix UI**: Accessible component primitives (dialogs, dropdowns, forms)
- **Recharts**: Charting library for analytics visualizations
- **date-fns**: Date formatting utilities
- **Lucide React**: Icon library

### Build Tools
- **Vite**: Frontend bundler with HMR
- **esbuild**: Server-side bundling for production
- **TypeScript**: Full-stack type checking

### Development
- **@replit/vite-plugin-runtime-error-modal**: Development error overlay
- **@replit/vite-plugin-cartographer**: Replit-specific dev tooling
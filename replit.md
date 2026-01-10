# Overview

This is a full-stack web application for the "KAK Cup" annual tournament platform. The project follows a modern React + Express architecture with TypeScript throughout. The application is designed as a tournament management system where users can select different tournament years and participate in annual competitions.

The frontend is built with React and uses shadcn/ui components for a polished user interface, while the backend provides a REST API built on Express. The application includes PWA (Progressive Web App) capabilities and is optimized for both desktop and mobile experiences.

# User Preferences

Preferred communication style: Simple, everyday language.

# Recent Changes (August 2025)

## Authentication & Authorization System
- Implemented username/password authentication with role-based access control system
- Created default admin user with username: "bopper", password: "AB12cd34!" (admin role)
- Protected all API endpoints requiring admin privileges for data modification
- Added login/logout functionality with authentication display on all pages
- Implemented role-based UI controls showing admin-only buttons and features to admin users only
- Added proper error handling for unauthorized access and admin privilege validation
- Public access: Anyone can browse all pages and view tournament data without logging in
- Admin privileges: Only logged-in admin users can modify data (add weights/scores, manage teams, lock competitions)
- Removed Replit Auth completely - now uses traditional username/password system only

## Lock Functionality & Competition Controls
- Implemented fishing competition lock system with fishing_locked column in years table
- Added red "Lock Competition" button to Fish tab that disables further weight additions (admin only)
- Enhanced "Add Weight" button to show "Locked - No More Weights" when competition is locked
- Added server-side validation returning 403 error when trying to add weights to locked competition
- Removed lock functionality from Chug and Golf tabs (only one entry per team allowed)
- Removed chug_locked and golf_locked columns from database (simplified to fishing_locked only)

# Recent Changes (August 2025)

## Database & Year Management
- Switched from tournament-based to year-based data model 
- Implemented PostgreSQL database with Drizzle ORM
- Created API endpoints for year management (/api/years)
- Successfully seeded 2025 tournament data
- Added locking columns to years table: fishing_locked, chug_locked, golf_locked (default false)

## Navigation & Routing  
- Made Select Year page the main landing page (/) with KAK Cup branding and poem
- Removed back navigation from Select Year page for cleaner interface
- Added year page routing (/year/:year) for tournament management
- Fixed React useRef errors by removing "use client" directives
- Simplified App.tsx to avoid shadcn component conflicts
- Implemented navigation flow: Select Year → Year Page (simplified from three-page flow)

## UI Improvements
- Updated year selection to start from 2025 (removed 2021-2024)
- Created year page with "KAK Cup [YEAR]" title format
- Added 5 bottom tabs: Teams, Fish, Chug, Golf, Standings
- Customized tab icons: Flag (golf), Beer (chug), Fish, Users (teams), Trophy (standings)
- Added Home navigation button in year page header for easy return to landing page

## Teams Management System
- Implemented full teams database schema with 7 teams per year, 4 members each
- Created table view with Team Name | KAK 1 | KAK 2 | KAK 3 | KAK 4 headers
- Added "Add Team" button with modal for creating new teams (max 7)
- Added edit buttons on each row to modify team details
- Implemented form validation requiring all member names before saving
- Teams auto-initialize with "Team 1" through "Team 7" default names
- Added lock/unlock functionality for teams with visual indicators
- Locked teams display black/bold text, unlocked teams show grey text
- Lock/unlock buttons only appear when teams are fully filled

## Competition Database Schema
- Created fish_weights table with foreign keys to teams and years
- Created chug_times table with foreign keys to teams and years  
- Created golf_scores table with foreign keys to teams and years
- Added proper Drizzle relations between all tables
- Tables include optional notes fields for additional details
- Added uniqueness constraints on year_id and team_id for chug_times and golf_scores
- Updated chug_times average column to 3 decimal precision for accurate calculations

## Competition Tabs Implementation
- Fish Tab: Unlimited weights per team, displays top-3, calculates totals and points (7-point system)
- Chug Tab: Two time entries per team with automatic average calculation and ranking
- Golf Tab: Score selector from -20 to +20 with "E" for even par, lowest score wins most points
- Standings Tab: Aggregates points from all three competitions and ranks teams by total points
- All tabs use consistent 7-point ranking system (7 for 1st, 1 for 7th, tied teams split points)

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript
- **UI Library**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **Forms**: React Hook Form with Zod validation
- **Build Tool**: Vite for fast development and optimized builds

## Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Pattern**: RESTful API with `/api` prefix
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Storage Pattern**: Interface-based storage layer with in-memory implementation (MemStorage) and database implementation
- **Development**: tsx for TypeScript execution in development

## Data Storage
- **Database**: PostgreSQL (configured via Neon Database)
- **ORM**: Drizzle ORM with type-safe schema definitions
- **Schema**: Shared schema between frontend and backend located in `/shared/schema.ts`
- **Migrations**: Drizzle Kit for database schema management
- **Tables**: Users and tournaments with proper relationships and constraints

## Authentication & Authorization
- Currently implements basic user schema with username/password fields
- Session management configured with connect-pg-simple for PostgreSQL session storage
- Authentication mechanism appears to be prepared but not fully implemented

## Progressive Web App Features
- Service Worker for offline functionality and caching
- Web App Manifest for native app-like experience
- Mobile-optimized design with responsive breakpoints
- Touch-friendly interface with mobile-first approach

## Development & Deployment
- **Development**: Hot module replacement with Vite
- **Production Build**: Vite builds frontend, esbuild bundles backend
- **Environment**: Separate development and production configurations
- **TypeScript**: Strict type checking across the entire stack

# External Dependencies

## Database & Infrastructure
- **@neondatabase/serverless**: Serverless PostgreSQL database connection
- **Neon Database**: Cloud PostgreSQL hosting service

## Frontend Libraries
- **@radix-ui/***: Comprehensive set of accessible UI primitives
- **@tanstack/react-query**: Server state management and caching
- **wouter**: Lightweight routing library
- **react-hook-form**: Form state management
- **zod**: Schema validation

## Development Tools
- **Vite**: Frontend build tool and development server
- **Drizzle Kit**: Database schema management and migrations
- **tsx**: TypeScript execution for development
- **esbuild**: Fast JavaScript bundler for production

## UI & Styling
- **Tailwind CSS**: Utility-first CSS framework
- **class-variance-authority**: Component variant management
- **clsx & tailwind-merge**: Conditional CSS class utilities
- **Lucide React**: Icon library

## Database & ORM
- **drizzle-orm**: Type-safe ORM with excellent TypeScript integration
- **drizzle-zod**: Zod schema generation from Drizzle schemas
- **connect-pg-simple**: PostgreSQL session store for Express

The application architecture emphasizes type safety, developer experience, and modern web standards while maintaining simplicity in the overall design.
#!/bin/bash
cd /home/c-jay69/Documents/GitHub/HYDRASKRIPT_JUNE21
DATABASE_URL="$(grep DATABASE_URL .env.local | cut -d'=' -f2- | tr -d '"')" bunx prisma migrate dev --name add_stripe_fields_and_editorial_review
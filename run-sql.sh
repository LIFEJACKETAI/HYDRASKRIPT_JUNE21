#!/bin/bash
cd /home/c-jay69/Documents/GitHub/HYDRASKRIPT_JUNE21
DATABASE_URL="$(grep DATABASE_URL .env.local | cut -d'=' -f2- | tr -d '"')" 
psql "$DATABASE_URL" -f fix-db.sql
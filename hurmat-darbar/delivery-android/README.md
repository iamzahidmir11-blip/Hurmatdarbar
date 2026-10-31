# Hurmat Darbar Delivery Rider App

Android application module for authorized delivery riders.

## Build
The repository GitHub Actions workflow builds a debug APK for this module and publishes it as a workflow artifact named `hurmat-darbar-delivery-android-debug`.

## Rider features
- Rider sign-in and assigned delivery work
- Order status updates
- Location permission and location reporting
- Delivery completion flow

A production release requires verified Supabase rider-role policies, a verified restaurant location, and a signed release build. Debug APKs are for testing only.

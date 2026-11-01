# Delivery app build verification

This commit triggers the repository Android CI workflow for both Android modules. A successful debug APK build is a compile check only; rider sign-in, role authorization, GPS permissions/background updates, order assignment, customer tracking, and delivery-code completion still require real-device end-to-end testing before production handover.

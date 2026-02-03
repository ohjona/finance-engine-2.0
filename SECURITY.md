# Security Policy

## Supported Versions

Use this section to tell people about which versions of your project are
currently being supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please do not open a public issue. instead, please send an email to **security@example.com** (replace with actual contact if available, or just say "Please reach out to the maintainer directly via GitHub Security Advisories or private email").

## Trusted Input Only

**Warning**: This tool is designed to process your own personal financial data.
It uses libraries (like `xlsx` and `exceljs`) that parse complex file formats.
While we strive to keep dependencies updated, **do not run this tool on untrusted files** downloaded from unknown sources.
Malicious Excel or CSV files could exploit vulnerabilities in the parsing libraries.

## Dependencies

This project uses `xlsx` (SheetJS) for parsing Excel files. We use the version hosted on the SheetJS CDN to avoid known vulnerabilities in the outdated npm version.

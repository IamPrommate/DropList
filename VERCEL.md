# Deploy DropList บน Vercel

Repo นี้มีหลายโฟลเดอร์แอป — **เว็บ Next.js อยู่ที่ `drop-list-web` เท่านั้น**

## แก้ error: “No Next.js version detected”

ใน Vercel เปิดโปรเจกต์ → **Settings** → **General** → **Root Directory**

- ตั้งเป็น **`drop-list-web`** (ไม่ใช่ว่าง, ไม่ใช่ `drop-list-api`)
- Save แล้ว **Redeploy**

ถ้า Root ชี้ไปที่ `drop-list-api` หรือโฟลเดอร์ที่ไม่มี dependency `next` จะได้ error นี้เสมอ

## สิ่งที่ควรตรวจหลังตั้ง Root

- **Environment Variables** ใส่ในโปรเจกต์เดียวกัน (ค่าจาก `drop-list-web/.env.local`)
- **`NEXTAUTH_URL`** = `https://<โดเมน-vercel>` (ไม่ใช่ localhost)
- Google OAuth redirect: `https://<โดเมน>/api/auth/callback/google`

## แอป API แยก

`drop-list-api` เป็น NestJS — ถ้าจะ deploy ควรสร้าง **โปรเจกต์ Vercel แยก** (หรือแพลตฟอร์มอื่น) และตั้ง Root เป็น `drop-list-api` พร้อม build command ของ Nest

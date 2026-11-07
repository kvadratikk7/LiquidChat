# LiquidChat

Мобильный веб-мессенджер на HTML/CSS/JS + Supabase.

## 1. Создание Supabase
1. Создай проект на https://supabase.com.
2. В SQL Editor выполни `supabase/schema.sql`.
3. В Project Settings → API скопируй Project URL и anon/public key.
4. Вставь их в начало `app.js` вместо `YOUR_PROJECT` и `YOUR_SUPABASE_ANON_KEY`.
5. В Authentication → Providers включи Email и/или Phone. Для телефона настрой SMS-провайдера.
6. Для email OTP настрой шаблон письма и SMTP для production.

## 2. Важное про регистрацию
Email-регистрация использует Supabase OTP/magic link (без пароля). Phone Auth использует SMS OTP.
Для phone signup Supabase может требовать включённого Phone provider и SMS-провайдера.
После подтверждения email пользователь входит через OTP.

## 3. Администратор
1. Зарегистрируй свой аккаунт обычным способом.
2. В SQL Editor выполни, заменив UUID на свой Auth user ID:
   `update public.profiles set username='owner' where id='ТВОЙ-UUID';`
   `insert into public.admin_users(user_id) values ('ТВОЙ-UUID');`
   Важно: username сам по себе не даёт админские права; доступ выдаётся только через закрытый список admin_users.
3. Установи Supabase CLI и выполни `supabase functions deploy admin-command`.
4. Установи секрет Edge Function:
   `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=ТВОЙ_SERVICE_ROLE_KEY`
   URL проекта также должен быть доступен функции как `SUPABASE_URL`.
5. Команды вводятся в поле сообщения, например `/verified @username` или `/ban @username`.
   Команда обрабатывается серверной функцией и не попадает в историю чата.

**Никогда не вставляй service_role key в HTML/JS.** Только anon key допустим на клиенте.

## 4. Запуск
Размести файлы `index.html`, `style.css`, `app.js` на HTTPS-хостинге (например, Cloudflare Pages, Netlify или Vercel).
Для локального теста используй любой static server, а не открытие `file://`.

## 5. Текущие ограничения первой версии
- Личные диалоги, создание групп/каналов, поиск, профиль, аватар, темы, сообщения и базовая realtime-подписка.
- Создание групп/каналов пока не включает приглашения участников и полноценную панель модерации.
- Для каналов отправка разрешена владельцу/администратору; чтение доступно участникам.
- Нужна дополнительная проверка и настройка RLS перед публичным запуском. SQL — стартовая схема, а не аудит безопасности.
- Админ-команда `/ban` блокирует регистрацию по совпадающим email/phone через trigger в `auth.users`. Для SMS-провайдера и email-подтверждения обязательно проверь тестовые сценарии.
- Фото с камеры зависит от поддержки `capture` браузером; на Android обычно открывается камера/выбор источника.

FROM node:20

ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

WORKDIR /app

COPY package*.json ./

RUN npm ci

RUN npx playwright install --with-deps chromium

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]

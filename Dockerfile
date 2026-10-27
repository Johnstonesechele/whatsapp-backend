FROM node:22
WORKDIR /app
COPY package.json ./
RUN npm install --legacy-peer-deps
COPY . .
ENV NODE_ENV=production
ENV ENABLE_WHATSAPP=true
ENV WHATSAPP_SESSION_PATH=/app/.wwebjs_auth
RUN npm run build
RUN mkdir -p /app/.wwebjs_auth
EXPOSE 10000
CMD ["npm", "start"]

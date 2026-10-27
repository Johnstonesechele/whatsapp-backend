FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
ENV NODE_ENV=production
ENV ENABLE_WHATSAPP=true
ENV WHATSAPP_SESSION_PATH=/app/.wwebjs_auth
RUN mkdir -p /app/.wwebjs_auth
EXPOSE 3001
CMD ["npm", "start"]

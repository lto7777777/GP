FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY . .

FROM node:20-alpine AS prod
# Port can be overwritted the env
ENV PORT=3000 
WORKDIR /app
#creating a non root user for security purposes
RUN addgroup -g 1001 nodejs && \
	adduser -S server -u 1001
COPY --from=build --chown=server:nodejs /app /app
USER server
EXPOSE $PORT 
CMD ["npm","start"]

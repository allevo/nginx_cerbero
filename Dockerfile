FROM node:carbon

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --only=production

COPY . .

ARG HTTP_PORT=3000

EXPOSE $HTTP_PORT
CMD [ "npm", "start", "--", "--port", "$HTTP_PORT", "--address", "0.0.0.0", "--log-level", "trace", "--prefix", "/auth"]

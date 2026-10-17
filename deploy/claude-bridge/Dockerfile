FROM node:22-slim
RUN npm install -g @anthropic-ai/claude-code && npm cache clean --force \
 && useradd -m -u 1001 claude && mkdir -p /home/claude/work /opt/bridge && chown -R claude:claude /home/claude
COPY server.mjs /opt/bridge/server.mjs
USER claude
WORKDIR /home/claude/work
ENV DISABLE_AUTOUPDATER=1 PORT=8080
EXPOSE 8080
CMD ["node", "/opt/bridge/server.mjs"]

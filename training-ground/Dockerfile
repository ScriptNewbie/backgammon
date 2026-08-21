FROM python:3.12-bookworm

WORKDIR /app

COPY docker-entrypoint.sh /docker-entrypoint.sh
COPY docker-install-host.sh /docker-install-host.sh
RUN sed -i 's/\r$//' /docker-entrypoint.sh /docker-install-host.sh && chmod +x /docker-entrypoint.sh /docker-install-host.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["python", "--version"]

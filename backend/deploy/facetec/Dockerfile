FROM eclipse-temurin:21-jre-jammy

RUN useradd --create-home --shell /usr/sbin/nologin facetec
WORKDIR /opt/facetec

# Mount the licensed FaceTec Server SDK distribution at runtime.
# Expected:
#   /opt/facetec/server/facetec-server.jar
#   /opt/facetec/config
#   /opt/facetec/data
ENV FACETEC_SERVER_PORT=8080
ENV FACETEC_CONFIG_DIR=/opt/facetec/config
ENV FACETEC_DATA_DIR=/opt/facetec/data

RUN mkdir -p /opt/facetec/server /opt/facetec/config /opt/facetec/data \
  && chown -R facetec:facetec /opt/facetec

USER facetec
EXPOSE 8080

CMD ["sh", "-c", "java -jar /opt/facetec/server/facetec-server.jar --port=${FACETEC_SERVER_PORT} --config=${FACETEC_CONFIG_DIR} --data=${FACETEC_DATA_DIR}"]

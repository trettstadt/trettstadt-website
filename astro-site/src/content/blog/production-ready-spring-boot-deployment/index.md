---
title: "Wie man einen Spring-Boot-Service für unter 15 € / Monat in Kubernetes betreibt"
description: "Der Artikel zeigt, wie man einen Spring-Boot-REST-Service sicher und performant designed und ihn automatisiert sowohl lokal als auch in einem produktiven, kostengünstigen Kubernetes-Cluster bei Hetzner deployen kann."
date: 2026-06-28
draft: false
---

### Summary

Startups stecken viel Geld in unnötige Cloud-Infrastruktur, bevor sie Gewinne abwerfen. Das Beispiel
zeigt ein voll-automatisiertes IaC-Deployment auf einem Kubernetes-Cluster, und das zu nur 15 % der
Kosten eines AWS-Kubernetes-Deployments.

Projekt auf Github: https://github.com/trettstadt/spring-boot-microservice

### Architektur

Microservices lassen sich auf unzählige Arten entwickeln, aber wegen der Stabilität und der hohen
Verfügbarkeit von Entwicklern hat sich im Enterprise-Umfeld Java mit Spring-Boot bewährt. Für den
Service wird außerdem die Ports-and-Adapters-Architektur verwendet, die eine strenge Trennung
zwischen Geschäftslogik und Technik sicherstellt und damit eine sehr gute Testbarkeit durch Unit-
und Integrationstests ermöglicht. Alle Architekturentscheidungen sind hier als ADR (architecture 
decision records) festgehalten:
https://github.com/trettstadt/spring-boot-microservice/tree/main/docs/adr 

![](https://github.com/trettstadt/spring-boot-microservice/blob/main/docs/architecture.png?raw=true)

### Entwicklung

Ein wesentlicher Punkt ist die korrekte Konfiguration der Web-Security, wobei ich standardmäßig
einen Audience-Validator hinzufüge, um sicherzustellen, dass jeder Service nur mit einem Token
aufgerufen werden kann, das auch für ihn bestimmt ist.

```java
/**
 * Spring security configuration for REST.
 */
@Configuration
@EnableWebSecurity
public class WebSecurityConfiguration {

  /**
   * Forcing to use separate tokens for each target service improves security.
   */
  @Bean
  OAuth2TokenValidator<Jwt> audienceValidator() {
    return new JwtClaimValidator<List<String>>(AUD,
        aud -> aud.contains("spring-boot-microservice"));
  }

  @Bean
  SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http
        .authorizeHttpRequests(authorize -> authorize
            .requestMatchers("/actuator/**").permitAll()
            .anyRequest().authenticated()
        )
        .oauth2ResourceServer(oauth2 -> oauth2
            .jwt(withDefaults())
        )
        .oauth2Client(withDefaults());
    return http.build();
  }
}
```

Bei *Ports and adapters* entsteht ein recht hoher Overhead, weil man Models zwischen Adaptern, Ports
und Domain mappen muss. Hier hilft Mapstruct, indem es automatisch Mapper aus einem Interface
erzeugt.

```java
/**
 * MapStruct mapper for converting between BookingOutPort and BookingDomain.
 */
@Mapper(componentModel = "spring", injectionStrategy = InjectionStrategy.CONSTRUCTOR)
public interface FindBookingsMapper {

  /**
   * Converts a booking output port to a domain booking.
   *
   * @param bookingOutPort the booking output port
   * @return the domain booking
   */
  BookingDomain fromPort(BookingOutPort bookingOutPort);

  /**
   * Converts a list of booking output ports to a list of domain bookings.
   *
   * @param bookingOutPorts the list of booking output ports
   * @return the list of domain bookings
   */
  List<BookingDomain> fromPort(List<BookingOutPort> bookingOutPorts);
}
```

Die *injectorStrategy* wurde wegen der besseren Testbarkeit in Unit-Tests gewählt und durch das
*componentModel* *spring* steht jeder Mapper direkt als Bean zur Verfügung.

Es wird ein *API first*-Ansatz verwendet, d. h. die API wird in einer OpenAPI-Spec definiert und die
Klassen mit dem *OpenAPI generator* erzeugt.

```yaml
openapi: "3.0.1"

info:
  title: Example API for bookings
  version: "1.0.0"

paths:
  /bookings:
    get:
      description: Returns a list of all bookings.
      operationId: getBookings
      responses:
        200:
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BookingList'

components:
  schemas:
    Booking:
      type: object
      properties:
        id:
          type: number
          format: int64
        description:
          type: string
    BookingList:
      type: object
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/Booking'
```

Das Datenbankschema wird mit *Liquibase* verwaltet. Dabei kann Liquibase Changelogs aus den
JPA-Entities generieren. Dazu wird das Liquibase-Maven-Plugin verwendet.

```yaml
databaseChangeLog:
  - changeSet:
      id: 1776502256728-1
      author: trettstadt (generated)
      changes:
        - createTable:
            columns:
              - column:
                  constraints:
                    nullable: false
                    primaryKey: true
                    primaryKeyName: booking_entryPK
                  name: id
                  type: BIGINT
              - column:
                  name: description
                  type: VARCHAR(255)
            tableName: booking_entry
```

### Lokales Deployment

Für die Entwicklung ist es unheimlich wichtig, den Service lokal laufen lassen und debuggen zu 
können. Für diesen Fall werden alle notwendigen Komponenten als Docker-Container zur Verfügung 
gestellt, die mit Docker-Compose schnell gestartet werden können. Es wird außerdem ein 
Spring-Profil *localdev* eingerichtet, in dem bereits alles für die lokale Entwicklung konfiguriert 
ist.

Um Fehler nachstellen zu können, die nur in der Kubernetes-Umgebung auftreten, kann der Service
auch per Helm in einem lokalen Cluster installiert werden. Hierfür wird das Helm-Chart aus dem
`gitops`-Verzeichnis mit der `values-local.yaml` verwendet.

### Deployment im produktiven Kubernetes-Cluster

Voraussetzung für das Deployment ist, dass ein Docker-Image für den Service gebaut wurde. Das
passiert automatisch in einem Github-Workflow
(https://github.com/trettstadt/spring-boot-microservice/actions/workflows/maven.yml), der das Image
in die Github-Container-Registry (GHCR) pushed.

Das Deployment besteht aus den Komponenten Server, Kubernetes und Deployment mit Helm, die hier 
alle im gleichen Repo liegen, während Server und Kubernetes in der Praxis getrennt davon
konfiguriert werden. Die grundlegende Infrastruktur (Cloud-Server, Firewall, etc.) wird mit Pulumi
deployed, d. h. es reicht der Befehl `pulumi up`, um die Server zu erstellen oder Änderungen daran
zu deployen. Die Einrichtung von Kubernetes erfolgt im nächsten Schritt mit Ansible. Hier wird
einfach das Ansible-Playbook ausgeführt, damit Kubernetes auf den beiden Servern eingerichtet wird.
Danach steht direkt zwei Kubernetes-Nodes zur Verfügung.

Im letzten Schritt werden per Helmfile alle benötigten Komponenten installiert:

1. Cert-Manager für die Bereitstellung von Let's-Encrypt-TLS-Zertifikaten
2. Traefik-Ingress-Controller, um die Kubernetes-Services erreichbar zu machen
3. PostgreSQL als Datenbank, die Hetzner-Cloud-Volumes aus Datenspeicher verwendet
4. Keycload als OIDC-Provider
5. External-Secrets für die sichere Bereitstellung von Passwörtern
6. der Service selbst

Wenn die Infrastruktur wächst, wird das Helmfile zu unübersichtlich und man würde dann auf *ArgoCD*
wechseln, welches die Synchronisation von Helm-Charts aus dem Git-Branch automatisieren kann und
damit echtes GitOps umsetzt.

### Observability

Es ist essenziell, den Service im laufenden Betrieb überwachen zu können, damit man im Fehlerfall
oder bei Performanceproblemen schnell sehen kann, wo das Problem liegt. Dazu sendet der Service
Metriken und Traces an *Grafana Cloud* und ein öffentliches Dashboard ist hier
zu finden: https://lavendertoast2486.grafana.net/public-dashboards/6353c61287bf461f9b25450a7a56c8d3
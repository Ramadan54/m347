# KN07: Kubernetes II

---

## A) Begriffe und Konzepte (40%)

### Unterschied zwischen Pods und Replicas

Ein **Pod** ist die kleinste Einheit in Kubernetes – er enthält einen oder mehrere Container, die zusammen auf einem Node laufen. Jeder Pod hat eine eigene interne IP-Adresse innerhalb des Clusters. Pods sind vergänglich: wenn ein Pod abstürzt, wird er neu gestartet, erhält aber eine neue IP.

Eine **Replica** bedeutet, dass derselbe Pod mehrfach gleichzeitig läuft. Wenn man z.B. 3 Replicas definiert, laufen 3 identische Kopien des Pods gleichzeitig. Das sorgt für Ausfallsicherheit und bessere Last-Verteilung – fällt ein Pod aus, laufen die anderen weiter. Kubernetes sorgt automatisch dafür, dass immer die gewünschte Anzahl Replicas aktiv ist.

---

### Unterschied zwischen Service und Deployment

Ein **Deployment** beschreibt _was_ laufen soll – also welches Container-Image verwendet wird, wie viele Replicas erstellt werden sollen und welche Umgebungsvariablen gesetzt sind. Es verwaltet die Pods und stellt sicher, dass immer die gewünschte Anzahl läuft. Bei einem Absturz startet das Deployment automatisch neue Pods.

Ein **Service** beschreibt _wie man auf die Pods zugreift_. Da Pods kommen und gehen und sich ihre internen IP-Adressen dabei ändern, gibt der Service eine stabile, fixe Adresse und einen fixen Port. Über den Service kann man die Pods immer erreichen, egal welcher Pod gerade läuft oder welche IP er hat. Der Service leitet Anfragen an die passenden Pods weiter anhand von sogenannten Labels.

---

### Welches Problem löst Ingress?

Ohne Ingress müsste man für jeden Service einen eigenen externen Port öffnen (z.B. 30100, 30200, 30300…). Das ist unübersichtlich und unpraktisch. Ingress löst dieses Problem, indem es als zentraler Einstiegspunkt vor dem Cluster sitzt und eingehende HTTP/HTTPS-Anfragen anhand der URL oder des Pfades an den richtigen internen Service weiterleitet. So braucht man nur einen einzigen Einstiegspunkt (Port 80 oder 443) für viele verschiedene Services.

---

### Was ist ein StatefulSet?

Ein **StatefulSet** ist für Anwendungen gedacht, die einen stabilen, eindeutigen Namen und dauerhaften Speicher benötigen. Im Gegensatz zu normalen Deployments bekommt jeder Pod im StatefulSet einen festen, geordneten Namen (z.B. `app-0`, `app-1`, `app-2`) und behält seinen Speicher auch nach einem Neustart.

**Beispiel (keine Datenbank):** Ein Elasticsearch-Cluster für die Log-Suche – jeder Knoten muss seine eigenen Index-Daten dauerhaft behalten, und die anderen Knoten müssen ihn immer unter demselben Namen finden können. Mit einem normalen Deployment wäre das nicht möglich, da Pods keine stabilen Namen und keinen persistenten Speicher haben.

---

## B) Demo Projekt (60%)

### Übersicht

Für dieses Projekt wurde ein bestehendes MicroK8s-Cluster aus KN06 verwendet. Es wurden eine MongoDB-Datenbank und eine Node.js-WebApp deployed. Die WebApp kommuniziert intern über einen ClusterIP-Service mit der Datenbank und ist von aussen über einen NodePort-Service erreichbar.

| Node           | Hostname         | Private IP    | Public IP      |
| -------------- | ---------------- | ------------- | -------------- |
| node1 (Master) | ip-172-31-68-211 | 172.31.68.211 | 3.95.133.68    |
| node2 (Master) | ip-172-31-70-109 | 172.31.70.109 | 18.232.179.15  |
| node3 (Worker) | ip-172-31-67-20  | 172.31.67.20  | 44.222.110.238 |

---

### 1. YAML-Dateien erstellen

Alle YAML-Dateien wurden auf node1 im Verzeichnis `~/kn07/` erstellt.

```bash
mkdir ~/kn07 && cd ~/kn07
```

| Befehl         | Erklärung                                                                            |
| -------------- | ------------------------------------------------------------------------------------ |
| `mkdir ~/kn07` | Erstellt einen neuen Ordner namens `kn07` im Home-Verzeichnis des Benutzers `ubuntu` |
| `cd ~/kn07`    | Wechselt in den neu erstellten Ordner                                                |

---

#### mongo-config.yaml (ConfigMap)

```bash
nano mongo-config.yaml
```

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: mongo-config
data:
  mongo-url: mongo-service
```

| Zeile                      | Erklärung                                                                                                                                                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind: ConfigMap`          | Definiert den Typ der Kubernetes-Ressource. Eine ConfigMap speichert Konfigurationsdaten als Key-Value-Paare                                                                                                                                                |
| `name: mongo-config`       | Der Name der ConfigMap, über den andere Ressourcen darauf verweisen können                                                                                                                                                                                  |
| `mongo-url: mongo-service` | Definiert die URL der MongoDB. Der Wert `mongo-service` ist der Name des internen Kubernetes-Services für MongoDB. Innerhalb des Clusters kann man Services direkt über ihren Namen ansprechen – Kubernetes löst den Namen automatisch zur richtigen IP auf |

**Warum ist der Wert `mongo-service` korrekt?**
Innerhalb eines Kubernetes-Clusters fungiert der Service-Name als DNS-Hostname. Da der MongoDB-Service `mongo-service` heisst, kann die WebApp ihn direkt über diesen Namen erreichen. Kubernetes' internes DNS löst `mongo-service` automatisch zur ClusterIP des Services auf.

---

#### mongo-secret.yaml (Secret)

```bash
nano mongo-secret.yaml
```

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: mongo-secret
type: Opaque
data:
  mongo-user: bW9uZ291c2Vy
  mongo-password: bW9uZ29wYXNzd29yZA==
```

| Zeile                                  | Erklärung                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `kind: Secret`                         | Definiert den Typ der Ressource. Ein Secret speichert sensible Daten wie Passwörter verschlüsselt |
| `type: Opaque`                         | Der häufigste Secret-Typ für beliebige Schlüssel-Wert-Paare                                       |
| `mongo-user: bW9uZ291c2Vy`             | Der Base64-codierte Benutzername (`mongouser`)                                                    |
| `mongo-password: bW9uZ29wYXNzd29yZA==` | Das Base64-codierte Passwort (`mongopassword`)                                                    |

Die Werte werden mit Base64 codiert (nicht verschlüsselt) gespeichert. In Linux kann man die Codierung so erstellen:

```bash
echo -n mongouser | base64
echo -n mongopassword | base64
```

---

#### mongo.yaml (MongoDB Deployment & Service)

```bash
nano mongo.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mongo-deployment
  labels:
    app: mongo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mongo
  template:
    metadata:
      labels:
        app: mongo
    spec:
      containers:
        - name: mongodb
          image: mongo:6
          ports:
            - containerPort: 27017
          env:
            - name: MONGO_INITDB_ROOT_USERNAME
              valueFrom:
                secretKeyRef:
                  name: mongo-secret
                  key: mongo-user
            - name: MONGO_INITDB_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: mongo-secret
                  key: mongo-password

---
apiVersion: v1
kind: Service
metadata:
  name: mongo-service
spec:
  selector:
    app: mongo
  ports:
    - protocol: TCP
      port: 27017
      targetPort: 27017
```

| Zeile                              | Erklärung                                                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `kind: Deployment`                 | Definiert ein Deployment, das die Pods verwaltet                                                           |
| `replicas: 1`                      | Es wird genau 1 MongoDB-Pod erstellt                                                                       |
| `image: mongo:6`                   | Verwendet das offizielle MongoDB-Image in Version 6 von Docker Hub                                         |
| `containerPort: 27017`             | Der Standard-Port von MongoDB innerhalb des Containers                                                     |
| `secretKeyRef`                     | Liest den Wert aus dem zuvor erstellten Secret `mongo-secret`                                              |
| `kind: Service`                    | Definiert einen Service für den Zugriff auf den MongoDB-Pod                                                |
| `type: (kein Eintrag = ClusterIP)` | Ohne explizite Typ-Angabe ist der Service vom Typ ClusterIP – er ist nur innerhalb des Clusters erreichbar |

---

#### webapp.yaml (WebApp Deployment & Service)

```bash
nano webapp.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webapp-deployment
  labels:
    app: webapp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: webapp
  template:
    metadata:
      labels:
        app: webapp
    spec:
      containers:
        - name: webapp
          image: nanajanashia/k8s-demo-app:v1.0
          ports:
            - containerPort: 3000
          env:
            - name: DB_URL
              valueFrom:
                configMapKeyRef:
                  name: mongo-config
                  key: mongo-url
            - name: USER_NAME
              valueFrom:
                secretKeyRef:
                  name: mongo-secret
                  key: mongo-user
            - name: USER_PWD
              valueFrom:
                secretKeyRef:
                  name: mongo-secret
                  key: mongo-password

---
apiVersion: v1
kind: Service
metadata:
  name: webapp-service
spec:
  type: NodePort
  selector:
    app: webapp
  ports:
    - protocol: TCP
      port: 3000
      targetPort: 3000
      nodePort: 30100
```

| Zeile                                   | Erklärung                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `image: nanajanashia/k8s-demo-app:v1.0` | Die Demo-WebApp von Docker Hub                                               |
| `containerPort: 3000`                   | Die Node.js-App lauscht intern auf Port 3000                                 |
| `configMapKeyRef`                       | Liest die MongoDB-URL aus der ConfigMap `mongo-config`                       |
| `type: NodePort`                        | Macht den Service von aussen erreichbar über einen fixen Port auf jedem Node |
| `nodePort: 30100`                       | Der externe Port, über den die App im Browser erreichbar ist                 |

---

### 2. YAML-Dateien deployen

Die Dateien wurden in dieser Reihenfolge angewendet – zuerst ConfigMap und Secret, da die anderen Ressourcen davon abhängig sind:

```bash
microk8s kubectl apply -f mongo-config.yaml
microk8s kubectl apply -f mongo-secret.yaml
microk8s kubectl apply -f mongo.yaml
microk8s kubectl apply -f webapp.yaml
```

| Befehl                              | Erklärung                                                                                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `microk8s kubectl apply -f <datei>` | Wendet die Konfiguration aus der YAML-Datei auf den Cluster an. `-f` steht für "file". Wenn die Ressource noch nicht existiert, wird sie erstellt. Wenn sie bereits existiert, wird sie aktualisiert |

---

### 3. `microk8s kubectl describe service webapp-service` auf node1 und node2

Der Befehl `describe` zeigt detaillierte Informationen über eine Kubernetes-Ressource an.

```bash
microk8s kubectl describe service webapp-service
```

**Screenshot: describe webapp-service auf node1:**

![describe webapp-service node1](Bilder/kn07_describe_webapp_service_node1.png)

**Screenshot: describe webapp-service auf node2:**

![describe webapp-service node2](Bilder/kn07_describe_webapp_service_node2.png)

Die Ausgabe auf node1 und node2 ist **identisch**. Das liegt daran, dass beide Master-Nodes den vollständigen Cluster-Zustand kennen und mit demselben Kubernetes API-Server kommunizieren. Der Service ist eine cluster-weite Ressource – es spielt keine Rolle von welchem Master-Node aus man ihn abfragt.

---

### 4. `microk8s kubectl describe service mongo-service` – Vergleich

```bash
microk8s kubectl describe service mongo-service
```

**Screenshot: describe mongo-service:**

![describe mongo-service](Bilder/kn07_describe_mongo_service.png)

**Unterschiede zwischen webapp-service und mongo-service:**

| Eigenschaft                 | webapp-service | mongo-service   |
| --------------------------- | -------------- | --------------- |
| **Type**                    | NodePort       | ClusterIP       |
| **NodePort**                | 30100/TCP      | keiner          |
| **External Traffic Policy** | Cluster        | nicht vorhanden |

Der wichtigste Unterschied ist der **Typ**: Der `webapp-service` ist vom Typ `NodePort` und ist von aussen über Port 30100 erreichbar. Der `mongo-service` ist vom Typ `ClusterIP` und hat **keine externe Erreichbarkeit** – er ist ausschliesslich innerhalb des Clusters zugänglich. Das ist bewusst so gewählt, da eine Datenbank aus Sicherheitsgründen nicht direkt von aussen erreichbar sein soll.

---

### 5. Datenbank nicht als StatefulSet umgesetzt

In Teil A wurde erklärt, dass ein **StatefulSet** für zustandsbehaftete Anwendungen wie Datenbanken verwendet werden sollte. Im Demo-Projekt wurde die MongoDB jedoch als **Deployment** umgesetzt – nicht als StatefulSet.

Der Grund ist die **Einfachheit des Demo-Projekts**: Ein Deployment reicht für eine einzelne MongoDB-Instanz ohne Replikation aus. Ein StatefulSet wäre notwendig, wenn man einen MongoDB-Cluster mit mehreren Replicas betreiben würde, bei dem jeder Knoten seine eigenen Daten behalten und unter einem stabilen Namen erreichbar sein muss. Für dieses einfache Demo-Beispiel mit einer einzigen Instanz ist der Mehraufwand eines StatefulSets nicht nötig.

---

### 6. WebApp aufrufen

Die WebApp ist über den NodePort 30100 auf der öffentlichen IP jedes Nodes erreichbar. Da MicroK8s NodePort-Services automatisch auf alle Host-IPs mappt, kann man jeden Node verwenden.

Dafür musste zuerst Port 30100 in der **AWS Security Group** (`microk8s-sg`) für eingehenden Datenverkehr freigegeben werden (Typ: Custom TCP, Source: 0.0.0.0/0).

**Screenshot: WebApp über node1 (http://3.95.133.68:30100):**

![WebApp node1](Bilder/kn07_webapp_node1.png)

**Screenshot: WebApp über node2 (http://18.232.179.15:30100):**

![WebApp node2](Bilder/kn07_webapp_node2.png)

---

### 7. MongoDB Compass Verbindung

Es wurde versucht, sich von aussen mit MongoDB Compass auf die Datenbank zu verbinden:

```
mongodb://mongouser:mongopassword@3.95.133.68:27017
```

**Screenshot: Verbindungsfehler in MongoDB Compass:**

![MongoDB Compass Fehler](Bilder/kn07_compass_connection_failed.png)

**Warum funktioniert es nicht?**

Der `mongo-service` ist vom Typ **ClusterIP** – er ist nur innerhalb des Kubernetes-Clusters erreichbar. Von aussen (dem lokalen PC) gibt es keinen Zugang, weil:

1. Kein `NodePort` im mongo-service definiert ist
2. Port 27017 in der AWS Security Group nicht geöffnet ist

**Was müsste man ändern damit es funktioniert:**

1. Den `mongo-service` von Typ `ClusterIP` auf `NodePort` ändern und einen `nodePort` (z.B. 27017) hinzufügen
2. Port 27017 in der AWS Security Group freigeben

---

### 8. Port auf 32000 ändern und Replicas auf 3 erhöhen

Die Datei `webapp.yaml` wurde angepasst:

- `nodePort: 30100` → `nodePort: 32000`
- `replicas: 1` → `replicas: 3`

```bash
nano ~/kn07/webapp.yaml
```

Danach die Änderungen anwenden:

```bash
microk8s kubectl apply -f ~/kn07/webapp.yaml
```

Zusätzlich musste Port **32000** in der AWS Security Group freigegeben werden (gleich wie Port 30100 zuvor).

**Pods nach der Änderung prüfen:**

```bash
microk8s kubectl get pods
```

```
NAME                                 READY   STATUS    RESTARTS   AGE
mongo-deployment-55f67bb7dc-cnpcl    1/1     Running   0          20m
webapp-deployment-84b94c8b84-6gr5s   1/1     Running   0          20m
webapp-deployment-84b94c8b84-7xztn   1/1     Running   0          15s
webapp-deployment-84b94c8b84-fpbhs   1/1     Running   0          15s
```

Es laufen nun **3 webapp-Pods** gleichzeitig.

**Screenshot: WebApp über node1 auf Port 32000 (http://3.95.133.68:32000):**

![WebApp Port 32000](Bilder/kn07_webapp_port32000.png)

**Screenshot: describe webapp-service nach der Änderung:**

```bash
microk8s kubectl describe service webapp-service
```

![describe webapp-service Replicas](Bilder/kn07_describe_webapp_service_replicas.png)

**Unterschied im Vergleich zu vorher:**

| Eigenschaft   | Vorher    | Nachher    |
| ------------- | --------- | ---------- |
| **NodePort**  | 30100/TCP | 32000/TCP  |
| **Endpoints** | 1 Eintrag | 3 Einträge |

Im Feld `Endpoints` sind jetzt **3 IP-Adressen** sichtbar – eine pro Replica. Das zeigt, dass der Service den Traffic auf alle 3 laufenden Pods verteilt.

---

## Zusammenfassung aller verwendeten Befehle

```bash
# DNS Addon prüfen
microk8s enable dns

# Projektordner erstellen
mkdir ~/kn07 && cd ~/kn07

# YAML-Dateien erstellen
nano mongo-config.yaml
nano mongo-secret.yaml
nano mongo.yaml
nano webapp.yaml

# Alle Dateien auflisten
ls -la

# YAML-Dateien deployen
microk8s kubectl apply -f mongo-config.yaml
microk8s kubectl apply -f mongo-secret.yaml
microk8s kubectl apply -f mongo.yaml
microk8s kubectl apply -f webapp.yaml

# Alle Ressourcen anzeigen
microk8s kubectl get all

# Services beschreiben
microk8s kubectl describe service webapp-service
microk8s kubectl describe service mongo-service

# Nodes mit Details anzeigen
microk8s kubectl get nodes -o wide

# Pods anzeigen
microk8s kubectl get pods

# webapp.yaml anpassen (Port + Replicas)
nano ~/kn07/webapp.yaml
microk8s kubectl apply -f ~/kn07/webapp.yaml
```

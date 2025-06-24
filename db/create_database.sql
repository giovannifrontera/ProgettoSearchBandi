-- ============================================================================
-- SCHOOL TENDER FINDER DATABASE CREATION SCRIPT
-- ============================================================================
-- Questo script crea il database completo per School Tender Finder
-- Configurazione: MySQL/MariaDB con charset UTF8MB4
-- ============================================================================

-- Crea il database se non esiste
CREATE DATABASE IF NOT EXISTS `school_tender_finder` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

-- Usa il database
USE `school_tender_finder`;

-- ============================================================================
-- TABELLA: schools
-- Memorizza le informazioni delle scuole italiane
-- ============================================================================
CREATE TABLE IF NOT EXISTS `schools` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `codice_mecc` VARCHAR(12) UNIQUE NOT NULL COMMENT 'Codice meccanografico della scuola',
  `denominazione` VARCHAR(255) NOT NULL COMMENT 'Nome completo della scuola',
  `regione` VARCHAR(100) NOT NULL COMMENT 'Regione di appartenenza',
  `provincia` VARCHAR(100) NOT NULL COMMENT 'Provincia di appartenenza', 
  `comune` VARCHAR(100) NOT NULL COMMENT 'Comune di ubicazione',
  `sito_web` VARCHAR(500) DEFAULT NULL COMMENT 'URL del sito web della scuola',
  `tipologia` VARCHAR(50) DEFAULT NULL COMMENT 'Tipologia di istituto (es: Liceo, ITIS, etc)',
  `indirizzo` VARCHAR(255) DEFAULT NULL COMMENT 'Indirizzo fisico della scuola',
  `cap` VARCHAR(5) DEFAULT NULL COMMENT 'Codice avviamento postale',
  `telefono` VARCHAR(20) DEFAULT NULL COMMENT 'Numero di telefono',
  `email` VARCHAR(100) DEFAULT NULL COMMENT 'Email di contatto',
  `pec` VARCHAR(100) DEFAULT NULL COMMENT 'PEC della scuola',
  `codice_fiscale` VARCHAR(16) DEFAULT NULL COMMENT 'Codice fiscale della scuola',
  `stato_crawler` ENUM('attivo', 'inattivo', 'errore') DEFAULT 'inattivo' COMMENT 'Stato del crawler per questa scuola',
  `ultima_scansione` DATETIME DEFAULT NULL COMMENT 'Timestamp dell\'ultima scansione effettuata',
  `numero_scansioni` INT UNSIGNED DEFAULT 0 COMMENT 'Contatore delle scansioni effettuate',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Data di creazione record',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Data ultimo aggiornamento',
  
  -- Indici per migliorare le performance
  INDEX `idx_regione` (`regione`),
  INDEX `idx_provincia` (`provincia`),
  INDEX `idx_comune` (`comune`),
  INDEX `idx_tipologia` (`tipologia`),
  INDEX `idx_stato_crawler` (`stato_crawler`),
  INDEX `idx_ultima_scansione` (`ultima_scansione`),
  INDEX `idx_denominazione` (`denominazione`),
  
  -- Indice full-text per ricerche testuali
  FULLTEXT INDEX `ft_search` (`denominazione`, `comune`, `indirizzo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Anagrafica delle scuole italiane';

-- ============================================================================
-- TABELLA: tenders  
-- Memorizza i bandi di gara e avvisi trovati
-- ============================================================================
CREATE TABLE IF NOT EXISTS `tenders` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `school_id` INT UNSIGNED NOT NULL COMMENT 'ID della scuola che ha pubblicato il bando',
  `title` VARCHAR(500) NOT NULL COMMENT 'Titolo del bando/avviso',
  `type` VARCHAR(100) DEFAULT NULL COMMENT 'Tipologia (es: bando, avviso, gara)',
  `category` VARCHAR(100) DEFAULT NULL COMMENT 'Categoria merceologica',
  `deadline` DATE DEFAULT NULL COMMENT 'Data di scadenza del bando',
  `publish_date` DATE DEFAULT NULL COMMENT 'Data di pubblicazione',
  `award_date` DATE DEFAULT NULL COMMENT 'Data di aggiudicazione (se disponibile)',
  `amount` DECIMAL(15,2) DEFAULT NULL COMMENT 'Importo del bando in euro',
  `currency` VARCHAR(3) DEFAULT 'EUR' COMMENT 'Valuta (default EUR)',
  `url` TEXT NOT NULL COMMENT 'URL completo del bando/documento',
  `document_url` TEXT DEFAULT NULL COMMENT 'URL del documento PDF/allegato',
  `summary` TEXT DEFAULT NULL COMMENT 'Riassunto/descrizione del bando',
  `status` ENUM('pubblicato', 'in_corso', 'scaduto', 'aggiudicato', 'annullato') DEFAULT 'pubblicato' COMMENT 'Stato del bando',
  `extraction_confidence` DECIMAL(3,2) DEFAULT NULL COMMENT 'Confidenza dell\'estrazione (0-1)',
  `last_checked` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Ultima verifica del bando',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Data di creazione record',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Data ultimo aggiornamento',
  
  -- Constraint di unicità per evitare duplicati
  UNIQUE KEY `uk_school_url` (`school_id`, `url`(255)),
  
  -- Chiave esterna verso schools
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  
  -- Indici per migliorare le performance
  INDEX `idx_publish_date` (`publish_date`),
  INDEX `idx_deadline` (`deadline`),
  INDEX `idx_type` (`type`),
  INDEX `idx_status` (`status`),
  INDEX `idx_amount` (`amount`),
  INDEX `idx_last_checked` (`last_checked`),
  INDEX `idx_school_publish` (`school_id`, `publish_date`),
  INDEX `idx_deadline_status` (`deadline`, `status`),
  
  -- Indice full-text per ricerche testuali
  FULLTEXT INDEX `ft_search` (`title`, `summary`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bandi di gara e avvisi pubblici';

-- ============================================================================
-- TABELLA: crawler_logs
-- Log delle operazioni del crawler
-- ============================================================================
CREATE TABLE IF NOT EXISTS `crawler_logs` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `school_id` INT UNSIGNED DEFAULT NULL COMMENT 'ID della scuola scansionata',
  `operation_type` ENUM('scan', 'import', 'update', 'error') NOT NULL COMMENT 'Tipo di operazione',
  `status` ENUM('success', 'warning', 'error') NOT NULL COMMENT 'Esito dell\'operazione',
  `message` TEXT NOT NULL COMMENT 'Messaggio descrittivo',
  `details` JSON DEFAULT NULL COMMENT 'Dettagli aggiuntivi in formato JSON',
  `execution_time_ms` INT UNSIGNED DEFAULT NULL COMMENT 'Tempo di esecuzione in millisecondi',
  `urls_scanned` INT UNSIGNED DEFAULT 0 COMMENT 'Numero di URL scansionati',
  `tenders_found` INT UNSIGNED DEFAULT 0 COMMENT 'Numero di bandi trovati',
  `tenders_new` INT UNSIGNED DEFAULT 0 COMMENT 'Numero di nuovi bandi',
  `tenders_updated` INT UNSIGNED DEFAULT 0 COMMENT 'Numero di bandi aggiornati',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Timestamp dell\'operazione',
  
  -- Chiave esterna verso schools (nullable per operazioni generali)
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  
  -- Indici per performance
  INDEX `idx_school_operation` (`school_id`, `operation_type`),
  INDEX `idx_status` (`status`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_operation_type` (`operation_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Log delle operazioni del crawler';

-- ============================================================================
-- TABELLA: crawler_queue  
-- Coda delle scansioni da effettuare
-- ============================================================================
CREATE TABLE IF NOT EXISTS `crawler_queue` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `school_id` INT UNSIGNED NOT NULL COMMENT 'ID della scuola da scansionare',
  `priority` TINYINT UNSIGNED DEFAULT 5 COMMENT 'Priorità (1=alta, 10=bassa)',
  `status` ENUM('pending', 'processing', 'completed', 'failed', 'cancelled') DEFAULT 'pending' COMMENT 'Stato della scansione',
  `scheduled_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'Quando è stata programmata',
  `started_at` DATETIME DEFAULT NULL COMMENT 'Quando è iniziata',
  `completed_at` DATETIME DEFAULT NULL COMMENT 'Quando è terminata',
  `retry_count` TINYINT UNSIGNED DEFAULT 0 COMMENT 'Numero di tentativi',
  `max_retries` TINYINT UNSIGNED DEFAULT 3 COMMENT 'Massimo numero di tentativi',
  `error_message` TEXT DEFAULT NULL COMMENT 'Messaggio di errore se fallita',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Data di creazione',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Data aggiornamento',
  
  -- Chiave esterna verso schools
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  
  -- Indici per performance
  INDEX `idx_status` (`status`),
  INDEX `idx_priority_scheduled` (`priority`, `scheduled_at`),
  INDEX `idx_school_status` (`school_id`, `status`),
  INDEX `idx_scheduled_at` (`scheduled_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Coda delle scansioni del crawler';

-- ============================================================================
-- TABELLA: settings
-- Impostazioni di sistema
-- ============================================================================
CREATE TABLE IF NOT EXISTS `settings` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `key_name` VARCHAR(100) NOT NULL UNIQUE COMMENT 'Chiave dell\'impostazione',
  `value` TEXT DEFAULT NULL COMMENT 'Valore dell\'impostazione',
  `description` VARCHAR(255) DEFAULT NULL COMMENT 'Descrizione dell\'impostazione',
  `type` ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string' COMMENT 'Tipo di dato',
  `is_public` BOOLEAN DEFAULT FALSE COMMENT 'Se l\'impostazione è visibile nel frontend',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Data di creazione',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Data aggiornamento',
  
  INDEX `idx_key_name` (`key_name`),
  INDEX `idx_is_public` (`is_public`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Impostazioni di sistema';

-- ============================================================================
-- VISTE UTILI
-- ============================================================================

-- Vista per statistiche scuole per regione
CREATE OR REPLACE VIEW `v_schools_by_region` AS
SELECT 
  `regione`,
  COUNT(*) as `total_schools`,
  COUNT(CASE WHEN `stato_crawler` = 'attivo' THEN 1 END) as `active_schools`,
  COUNT(CASE WHEN `ultima_scansione` IS NOT NULL THEN 1 END) as `scanned_schools`,
  MAX(`ultima_scansione`) as `last_scan_date`
FROM `schools`
GROUP BY `regione`
ORDER BY `total_schools` DESC;

-- Vista per statistiche bandi
CREATE OR REPLACE VIEW `v_tender_statistics` AS
SELECT 
  DATE_FORMAT(`publish_date`, '%Y-%m') as `month`,
  COUNT(*) as `total_tenders`,
  COUNT(CASE WHEN `status` = 'pubblicato' THEN 1 END) as `published`,
  COUNT(CASE WHEN `status` = 'scaduto' THEN 1 END) as `expired`,
  COUNT(CASE WHEN `status` = 'aggiudicato' THEN 1 END) as `awarded`,
  AVG(`amount`) as `avg_amount`,
  SUM(`amount`) as `total_amount`
FROM `tenders`
WHERE `publish_date` IS NOT NULL
GROUP BY DATE_FORMAT(`publish_date`, '%Y-%m')
ORDER BY `month` DESC;

-- Vista per bandi recenti con info scuola
CREATE OR REPLACE VIEW `v_recent_tenders` AS
SELECT 
  t.`id`,
  t.`title`,
  t.`type`,
  t.`status`,
  t.`deadline`,
  t.`publish_date`,
  t.`amount`,
  t.`url`,
  s.`denominazione` as `school_name`,
  s.`regione`,
  s.`provincia`,
  s.`comune`,
  t.`created_at`
FROM `tenders` t
JOIN `schools` s ON t.`school_id` = s.`id`
ORDER BY t.`publish_date` DESC, t.`created_at` DESC;

-- ============================================================================
-- DATI INIZIALI
-- ============================================================================

-- Inserisci impostazioni di default
INSERT IGNORE INTO `settings` (`key_name`, `value`, `description`, `type`, `is_public`) VALUES
('crawler_delay_ms', '2000', 'Ritardo tra le richieste del crawler (ms)', 'number', FALSE),
('crawler_timeout_ms', '30000', 'Timeout per le richieste HTTP (ms)', 'number', FALSE),
('crawler_max_concurrent', '5', 'Numero massimo di scansioni concorrenti', 'number', FALSE),
('crawler_user_agent', 'School Tender Finder Bot 1.0', 'User Agent del crawler', 'string', FALSE),
('app_name', 'School Tender Finder', 'Nome dell\'applicazione', 'string', TRUE),
('app_version', '1.0.0', 'Versione dell\'applicazione', 'string', TRUE),
('auto_scan_enabled', 'false', 'Scansione automatica abilitata', 'boolean', TRUE),
('scan_schedule_cron', '0 2 * * *', 'Schedule per scansione automatica (formato cron)', 'string', FALSE),
('max_tender_age_days', '365', 'Numero massimo di giorni per mantenere i bandi', 'number', TRUE);

-- ============================================================================
-- TRIGGERS UTILI
-- ============================================================================

-- Trigger per aggiornare numero_scansioni in schools
DELIMITER $$
CREATE TRIGGER `tr_update_school_scan_count` 
AFTER INSERT ON `crawler_logs`
FOR EACH ROW
BEGIN
  IF NEW.school_id IS NOT NULL AND NEW.operation_type = 'scan' AND NEW.status = 'success' THEN
    UPDATE `schools` 
    SET 
      `numero_scansioni` = `numero_scansioni` + 1,
      `ultima_scansione` = NEW.created_at
    WHERE `id` = NEW.school_id;
  END IF;
END$$
DELIMITER ;

-- ============================================================================
-- INDICI COMPOSITI AGGIUNTIVI PER PERFORMANCE
-- ============================================================================

-- Indice per ricerche di bandi per scuola e data
ALTER TABLE `tenders` ADD INDEX `idx_school_date_status` (`school_id`, `publish_date`, `status`);

-- Indice per ricerche geografiche
ALTER TABLE `schools` ADD INDEX `idx_geographic` (`regione`, `provincia`, `comune`);

-- ============================================================================
-- STORED PROCEDURES UTILI (OPZIONALI)
-- ============================================================================

-- Procedura per pulire bandi vecchi
DELIMITER $$
CREATE PROCEDURE `sp_cleanup_old_tenders`(IN days_old INT)
BEGIN
  DECLARE affected_rows INT DEFAULT 0;
  
  DELETE FROM `tenders` 
  WHERE `publish_date` < DATE_SUB(CURRENT_DATE, INTERVAL days_old DAY)
    AND `status` IN ('scaduto', 'aggiudicato');
    
  SET affected_rows = ROW_COUNT();
  
  INSERT INTO `crawler_logs` (`operation_type`, `status`, `message`, `tenders_found`)
  VALUES ('cleanup', 'success', CONCAT('Rimossi ', affected_rows, ' bandi vecchi'), affected_rows);
END$$
DELIMITER ;

-- ============================================================================
-- COMMENTI FINALI
-- ============================================================================

/*
ISTRUZIONI PER L'USO:

1. Esegui questo script per creare il database completo
2. Il database verrà creato con charset UTF8MB4 per supportare emoji e caratteri speciali
3. Le tabelle includono indici ottimizzati per le query più comuni
4. Le viste forniscono statistiche pronte all'uso
5. I triggers mantengono automaticamente le statistiche aggiornate

CONFIGURAZIONE CONSIGLIATA PER MySQL:
- innodb_buffer_pool_size: almeno 256MB
- max_connections: 100-200
- character_set_server: utf8mb4
- collation_server: utf8mb4_unicode_ci

MANUTENZIONE:
- Esegui `sp_cleanup_old_tenders(365)` periodicamente per pulire bandi vecchi
- Monitora la crescita della tabella crawler_logs
- Considera il backup regolare del database
*/

-- Fine script
-- ============================================================================

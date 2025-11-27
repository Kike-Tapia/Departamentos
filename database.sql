-- Base de datos para Sistema de Gestión de Departamentos
-- Ejecutar este script en phpMyAdmin o MySQL

CREATE DATABASE IF NOT EXISTS departamentos_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE departamentos_db;

-- Tabla de usuarios para el sistema de login
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    activo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de departamentos
CREATE TABLE IF NOT EXISTS departamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    direccion VARCHAR(255) NOT NULL,
    numero INT NOT NULL,
    descripcion VARCHAR(500) NOT NULL,
    estado VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insertar usuarios de ejemplo
-- IMPORTANTE: Los hashes de contraseña deben generarse con password_hash() de PHP
-- Para crear los usuarios correctamente, ejecutar: setup_users.php desde el navegador
-- O usar los siguientes INSERT después de generar los hashes con PHP

-- Usuario 1: admin / Contraseña: admin123
-- Usuario 2: usuario / Contraseña: usuario123

-- NOTA: No insertar usuarios directamente aquí. Usar setup_users.php para generar hashes correctos
-- Los INSERT se ejecutarán automáticamente desde setup_users.php

-- Insertar algunos datos de ejemplo en departamentos
INSERT INTO departamentos (direccion, numero, descripcion, estado) VALUES
('Av. Principal', 101, 'Departamento amplio con vista al mar', 'Disponible'),
('Calle Los Olivos', 205, 'Departamento moderno en zona céntrica', 'Ocupado'),
('Jr. San Martín', 150, 'Departamento con balcón y buena iluminación', 'Disponible');

